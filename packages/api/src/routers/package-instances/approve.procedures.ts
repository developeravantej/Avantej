import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import {
	notifyCustomerPackageAssigned,
	notifyCustomerPackageRejected,
	clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq, inArray, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import type { TenantTx } from "./types";

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
        // LC-C2: cancel outstanding instalment rows before setting package to cancelled
        await tx
          .update(installments)
          .set({ status: "cancelled", updatedAt: now })
          .where(
            and(
              eq(installments.packageInstanceId, pkg.id),
              inArray(installments.status, ["pending", "overdue"]),
            ),
          );

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
      const succeededDetails: Array<{ id: string; clientId: string | null; serviceName: string }> = [];

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

            await tx.insert(packageInstanceStaff).values({
              packageInstanceId: pkg.id,
              staffId: trainerMember.userId,
              slotIndex: 0,
              role: "trainer",
              assignedBy: callerUserId,
              assignedAt: now,
            }).onConflictDoNothing();

            // PS-01: Previously this block silently auto-confirmed the first
            // instalment with a hardcoded `manual_transfer` paymentMethod when
            // `installmentsTotal > 1` and `installmentsPaid === 0`. That
            // misrepresented the real tender (no money had actually moved) and
            // diverged from the single-row `assignTrainer` procedure, which
            // never auto-confirms.
            //
            // Bulk approve now only assigns the trainer and activates the
            // package — exactly mirroring `assignTrainer`. First instalments
            // must be confirmed explicitly via the installments router
            // (`confirmPayment`) so the real paymentMethod is recorded.
          });
          succeeded.push(pkgId);
          succeededDetails.push({
            id: pkgId,
            clientId: pkg.clientId ?? null,
            serviceName: svc?.name ?? "your package",
          });
        } catch (err) {
          failed.push({
            id: pkgId,
            reason: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      // Post-loop: send customer notifications (non-critical, best-effort)
      try {
        const controlPanelDb = getControlPanelDb(context);
        const [trainerUser] = await controlPanelDb
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, trainerMember.userId));
        const trainerName = trainerUser?.name ?? "Your trainer";

        for (const detail of succeededDetails) {
          if (detail.clientId) {
            await notifyCustomerPackageAssigned(context.tenantDb, {
              packageInstanceId: detail.id,
              customerUserId: detail.clientId,
              serviceName: detail.serviceName,
              trainerName,
            });
          }
          await clearPendingReviewNotifications(context.tenantDb, detail.id);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("bulkApprove post-loop notifications failed:", err);
      }

      return {
        succeeded,
        failed,
        succeededCount: succeeded.length,
        failedCount: failed.length,
      };
    })
};
