/**
 * Package Instances Router
 *
 * API endpoints for package instances (client assignments/purchases).
 * getActiveForClient / listForUser: client view (session user). create: staff or purchase flow.
 */

import {
  listPackageInstancesForClient,
  getPackageInstanceById,
  createPackageInstance,
  createInstallmentSchedule,

  getPackageInstanceStatusHistory,
  cancelPackageInstance,
  freezePackageInstance,
  unfreezePackageInstance,
  extendPackageInstance,
} from "@avantej-core/services";
import { listMemberships, listAssignedToMember } from "@avantej-core/services/package-instance.service";
import { getSetting } from "@avantej-core/services/organization-settings.service";
import {
  notifyStaffOfPendingPackage,
  notifyCustomerPackageAssigned,
  notifyCustomerPackageRejected,
  clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { services } from "@avantej-core/db/schema/tenant/services";
import { listExpiringMemberships } from "@avantej-core/services/memberships.service";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { user, user as cpUsers } from "@avantej-core/db/schema/auth";
import { desc, and, eq, inArray } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

const sourceSchema = z.enum(["assigned", "purchased"]);
const paymentStatusSchema = z.enum(["pending", "paid", "failed", "refunded", "partially_paid"]);
const statusSchema = z.enum([
  "pending",
  "active",
  "frozen",
  "completed",
  "expired",
  "exhausted",
  "cancelled",
]);

// Org setting that gates customer-purchased packages behind an admin/trainer
// approval. When "true" (default), `source: "purchased"` packages start in
// `status: "pending"` and require trainer assignment before being usable.
const PACKAGE_APPROVAL_REQUIRED_KEY = "package_approval.required";

export const packageInstancesApproveProcedures = {
	/**
   * Reject a pending package — admin only. Sets status: cancelled,
   * cancellationReason, cancelledBy and notifies the customer.
   * Refund handling is out of scope for v1.
   */
  reject: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceId: z.string().uuid(),
        reason: z.string().max(500).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      
		assertOrgContextMatch(context, input);
      if (context.member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can reject packages",
        });
      }

      // 7.5: Never write an empty string to audit columns — session must be present
      const callerUserId = context.session?.user?.id;
      if (!callerUserId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Session user ID is required for this operation",
        });
      }

      const pkg = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.packageInstanceId),
      });
      if (!pkg) {
        throw new ORPCError("NOT_FOUND", { message: "Package not found" });
      }
      if (pkg.status !== "pending") {
        throw new ORPCError("BAD_REQUEST", {
          message: `Package is not pending (current status: ${pkg.status})`,
        });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, pkg.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "You do not have access to this branch",
          });
        }
      }

      const now = new Date();
      
      const updated = await context.tenantDb.transaction(async (tx: TenantTx) => {
        const [row] = await tx
          .update(packageInstances)
          .set({
            status: "cancelled",
            cancellationReason: input.reason ?? "Rejected by admin",
            cancelledBy: callerUserId,
            updatedAt: now,
          })
          .where(eq(packageInstances.id, pkg.id))
          .returning();
        if (!row) throw new Error("Failed to update package");

        await writeAudit(tx, {
          actorUserId: callerUserId,
          actorMemberId: context.member!.id,
          actorRole: context.member!.role,
          action: "package.rejected",
          entityType: "package_instance",
          entityId: pkg.id,
          branchId: svc?.branchId ?? undefined,
          summary: `Rejected package ${pkg.id}${
            input.reason ? `: ${input.reason}` : ""
          }`,
          changes: { reason: input.reason ?? null },
        });

        // 7.6: Status-history row — pending → cancelled on admin rejection
        await appendPackageInstanceStatusHistory(tx, pkg.id, {
          fromStatus: pkg.status,
          toStatus: "cancelled",
          changedBy: callerUserId,
          reason: input.reason ?? "Rejected by admin",
        });

        return row;
      });

      try {
        if (updated.clientId) {
          await notifyCustomerPackageRejected(context.tenantDb, {
            packageInstanceId: updated.id,
            customerUserId: updated.clientId,
            serviceName: svc?.name ?? "your package",
            reason: input.reason ?? null,
          });
        }
        await clearPendingReviewNotifications(context.tenantDb, updated.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("post-reject side-effects failed:", err);
      }

      return updated;
    }),

	/**
   * Bulk approve (assign trainer to) multiple pending packages in one call.
   * Per-row failures don't abort the batch — returns counts + per-id outcomes.
   *
   * Validation per row mirrors `assignTrainer`:
   * - Package must exist and be in `pending` status
   * - Trainer must be active + role trainer|admin
   * - Trainer's hierarchyScopeId must match the package service's branchId
   *   (when service has a branch)
   * - Caller's accessibleNodeIds must include the service branch (admins)
   */
  bulkApprove: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceIds: z.array(z.string().uuid()).min(1).max(100),
        trainerMemberId: z.string().uuid(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      
		assertOrgContextMatch(context, input);
      const callerRole = context.member.role;
      const callerUserId = context.session?.user?.id;
      if (!callerUserId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Session user ID is required for this operation",
        });
      }
      if (callerRole === "trainer") {
        if (input.trainerMemberId !== context.member.id) {
          throw new ORPCError("FORBIDDEN", {
            message: "Trainers can only assign themselves",
          });
        }
      } else if (callerRole !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins or trainers can assign packages",
        });
      }

      const trainerMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.trainerMemberId),
      });
      if (!trainerMember) {
        throw new ORPCError("NOT_FOUND", { message: "Trainer not found" });
      }
      if (trainerMember.status !== "active") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Trainer is not active",
        });
      }
      if (
        trainerMember.role !== "trainer" &&
        trainerMember.role !== "admin"
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Target member is not a trainer",
        });
      }

      const accessibleNodeIds = context.accessibleNodeIds ?? [];
      const succeeded: string[] = [];
      const failed: Array<{ id: string; reason: string }> = [];

      for (const pkgId of input.packageInstanceIds) {
        try {
          const pkg = await context.tenantDb.query.packageInstances.findFirst({
            where: eq(packageInstances.id, pkgId),
          });
          if (!pkg) {
            failed.push({ id: pkgId, reason: "Package not found" });
            continue;
          }
          if (pkg.status !== "pending") {
            failed.push({
              id: pkgId,
              reason: `Not pending (status: ${pkg.status})`,
            });
            continue;
          }

          const svc = await context.tenantDb.query.services.findFirst({
            where: eq(services.id, pkg.serviceId),
          });
          if (svc?.branchId && trainerMember.hierarchyScopeId !== svc.branchId) {
            failed.push({
              id: pkgId,
              reason: "Trainer not in same branch as package",
            });
            continue;
          }
          if (
            callerRole === "admin" &&
            svc?.branchId &&
            !accessibleNodeIds.includes(svc.branchId)
          ) {
            failed.push({
              id: pkgId,
              reason: "Branch outside your access",
            });
            continue;
          }

          const now = new Date();
          await context.tenantDb.transaction(async (tx: any) => {
            await tx
              .update(packageInstances)
              .set({
                status: "active",
                assignedTrainerId: trainerMember.id,
                assignedTrainerAssignedBy: callerUserId,
                assignedTrainerAssignedAt: now,
                approvedAt: now,
                approvedBy: callerUserId,
                updatedAt: now,
              })
              .where(eq(packageInstances.id, pkg.id));

            await writeAudit(tx, {
              actorUserId: callerUserId,
              actorMemberId: context.member!.id,
              actorRole: context.member!.role,
              action: "package.assigned",
              entityType: "package_instance",
              entityId: pkg.id,
              branchId: svc?.branchId ?? undefined,
              summary: `Bulk approve: assigned trainer ${trainerMember.id} to package ${pkg.id}`,
              changes: {
                assignedTrainerId: trainerMember.id,
                bulk: true,
              },
            });

            await appendPackageInstanceStatusHistory(tx, pkg.id, {
              fromStatus: pkg.status,
              toStatus: "active",
              changedBy: callerUserId,
              reason: "Bulk approve",
            });
          });
          succeeded.push(pkgId);
        } catch (err) {
          failed.push({
            id: pkgId,
            reason: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return {
        succeeded,
        failed,
        succeededCount: succeeded.length,
        failedCount: failed.length,
      };
    })
};
