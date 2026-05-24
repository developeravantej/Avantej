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

export const packageInstancesBulkRejectProcedures = {
	/**
   * Bulk reject multiple pending packages — admin only.
   * Same per-row validation as `reject`. Per-row failures don't abort the batch.
   */
  bulkReject: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceIds: z.array(z.string().uuid()).min(1).max(100),
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
      const callerUserId = context.session?.user?.id;
      if (!callerUserId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Session user ID is required for this operation",
        });
      }

      const accessibleNodeIds = context.accessibleNodeIds ?? [];
      const succeeded: string[] = [];
      const failed: Array<{ id: string; reason: string }> = [];
      const reason = input.reason ?? "Rejected by admin";

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
          if (svc?.branchId && !accessibleNodeIds.includes(svc.branchId)) {
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
                status: "cancelled",
                cancellationReason: reason,
                cancelledBy: callerUserId,
                updatedAt: now,
              })
              .where(eq(packageInstances.id, pkg.id));

            await writeAudit(tx, {
              actorUserId: callerUserId,
              actorMemberId: context.member!.id,
              actorRole: context.member!.role,
              action: "package.rejected",
              entityType: "package_instance",
              entityId: pkg.id,
              branchId: svc?.branchId ?? undefined,
              summary: `Bulk reject: ${pkg.id}${input.reason ? `: ${input.reason}` : ""}`,
              changes: { reason, bulk: true },
            });

            await appendPackageInstanceStatusHistory(tx, pkg.id, {
              fromStatus: pkg.status,
              toStatus: "cancelled",
              changedBy: callerUserId,
              reason,
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
