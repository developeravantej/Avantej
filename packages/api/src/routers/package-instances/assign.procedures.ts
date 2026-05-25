import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import {
	notifyCustomerPackageAssigned,
	clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import type { TenantTx } from "./types";

export const packageInstancesAssignProcedures = {
	/**
   * Assign a trainer to a pending package_instance. Pattern C: assignment
   * IS approval — the package transitions to `active` in the same operation.
   *
   * Authorization:
   * - Admin: may assign any trainer in the same branch.
   * - Trainer: may self-assign only (trainerMemberId === own member.id).
   * - Other roles: forbidden.
   */
  assignTrainer: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceId: z.string().uuid(),
        trainerMemberId: z.string().uuid(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

		assertOrgContextMatch(context, input);
      const callerRole = context.member.role;
      const callerUserId = context.session?.user?.id;
      // 7.5: Never write an empty string to audit columns — session must be present
      if (!callerUserId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Session user ID is required for this operation",
        });
      }

      // Self-assign rule for trainers
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

      // Load package
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

      // Load target trainer member
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

      // Verify trainer is in the same branch as the package's service
      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, pkg.serviceId),
      });
      if (svc?.branchId && trainerMember.hierarchyScopeId !== svc.branchId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Trainer is not in the same branch as this package",
        });
      }

      // Admin scope check: caller's accessibleNodeIds must include service branch
      if (callerRole === "admin" && svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "You do not have access to this branch",
          });
        }
      }

      const now = new Date();

      // Transaction: update package + write staff slot + audit + notifications
      try {
        
        const updated = await context.tenantDb.transaction(async (tx: TenantTx) => {
          const [row] = await tx
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
            .where(eq(packageInstances.id, pkg.id))
            .returning();
          if (!row) throw new Error("Failed to update package");

          // Write primary trainer to package_instance_staff (slot 0)
          await tx.insert(packageInstanceStaff).values({
            packageInstanceId: pkg.id,
            staffId: trainerMember.userId,
            slotIndex: 0,
            role: "trainer",
            assignedBy: callerUserId,
          });

          await writeAudit(tx, {
            actorUserId: callerUserId,
            actorMemberId: context.member!.id,
            actorRole: callerRole,
            action: "package.assigned",
            entityType: "package_instance",
            entityId: pkg.id,
            branchId: svc?.branchId ?? undefined,
            summary: `Assigned trainer ${trainerMember.id} to package ${pkg.id}`,
            changes: {
              trainerMemberId: trainerMember.id,
              trainerUserId: trainerMember.userId,
            },
          });

          // 7.4: Status-history row — pending → active on trainer assignment/approval
          await appendPackageInstanceStatusHistory(tx, pkg.id, {
            fromStatus: pkg.status,
            toStatus: "active",
            changedBy: callerUserId,
            reason: "Trainer assigned — package approved",
          });

          return row;
        });

        // Side-effects (post-tx, non-critical)
        try {
          // Resolve trainer name from control panel
          const controlPanelDb = getControlPanelDb(context);
          const [trainerUser] = await controlPanelDb
            .select({ name: user.name })
            .from(user)
            .where(eq(user.id, trainerMember.userId));
          const trainerName = trainerUser?.name ?? "Your trainer";

          if (updated.clientId) {
            await notifyCustomerPackageAssigned(context.tenantDb, {
              packageInstanceId: updated.id,
              customerUserId: updated.clientId,
              serviceName: svc?.name ?? "your package",
              trainerName,
            });
          }
          await clearPendingReviewNotifications(context.tenantDb, updated.id);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("post-assign side-effects failed:", err);
        }

        return updated;
      } catch (err) {
        // Postgres unique-violation on (packageInstanceId, slotIndex) when
        // two trainers race to self-assign — surface a friendly message.
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code?: string }).code === "23505"
        ) {
          throw new ORPCError("CONFLICT", {
            message: "This package was just assigned to another trainer.",
          });
        }
        throw err;
      }
    }),

	/**
   * Bulk assign a package (service) to multiple customers in one call.
   *
   * Input `customerIds` are tenant `members.id` values (as returned by
   * customerDirectory.list). The procedure resolves each to `members.userId`
   * (the control-panel user ID) which becomes `clientId` on the created
   * package_instance row.
   *
   * Per-row failures don't abort the batch — returns success/failure counts.
   *
   * Permission: service_management:create (matches the single-row `create`).
   */
  bulkAssign: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        customerIds: z.array(z.string().uuid()).min(1).max(100),
        packageId: z.string().uuid(), // serviceId of the package/service
        branchId: z.string().uuid(),
        trainerMemberId: z.string().uuid().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date YYYY-MM-DD"),
        notes: z.string().max(500).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "create");

      const callerUserId = context.session?.user?.id;
      if (!callerUserId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Session user ID is required for this operation",
        });
      }

      // Resolve the package/service
      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, input.packageId),
      });
      if (!svc) {
        throw new ORPCError("NOT_FOUND", { message: "Package/service not found" });
      }
      if (!svc.isActive) {
        throw new ORPCError("BAD_REQUEST", { message: "Package/service is not active" });
      }

      // Validate branchId is within caller's accessible scope
      const accessibleNodeIds = context.accessibleNodeIds ?? [];
      guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
      // Batch-resolve customerIds (tenant members.id) → userId (control-panel user id)
      const memberRows = await context.tenantDb
        .select({ id: members.id, userId: members.userId })
        .from(members)
        .where(inArray(members.id, input.customerIds));

      const memberToUserId = new Map(memberRows.map((m: { id: string; userId: string }) => [m.id, m.userId] as [string, string]));

      // Compute dates
      const startsAt = new Date(input.startDate);
      const expiresAt = svc.expiryDays
        ? new Date(startsAt.getTime() + svc.expiryDays * 24 * 60 * 60 * 1000)
        : new Date(startsAt.getTime() + 365 * 24 * 60 * 60 * 1000); // default 1 year

      const creditsTotal = svc.sessionCount ?? 1;

      const succeeded: string[] = [];
      const failed: Array<{ customerId: string; reason: string }> = [];

      for (const customerId of input.customerIds) {
        const userId = memberToUserId.get(customerId);
        if (!userId) {
          failed.push({ customerId, reason: "Customer member not found" });
          continue;
        }

        try {
          // biome-ignore lint/suspicious/noExplicitAny: tx type is internal to Drizzle
          await context.tenantDb.transaction(async (tx: any) => {
            const now = new Date();
            await tx.insert(packageInstances).values({
              serviceId: input.packageId,
              clientId: userId,
              source: "assigned",
              assignedBy: callerUserId,
              creditsTotal,
              creditsUsed: 0,
              startsAt,
              expiresAt,
              status: "active",
              remark: input.notes ?? null,
              preferredTrainerId: input.trainerMemberId ?? null,
              assignedTrainerId: input.trainerMemberId ?? null,
              assignedTrainerAssignedBy: input.trainerMemberId ? callerUserId : null,
              assignedTrainerAssignedAt: input.trainerMemberId ? now : null,
              paymentStatus: "paid",
              paymentMethod: null,
              totalPrice: svc.price ?? null,
              taxAmount: 0,
              installmentsTotal: 1,
              installmentsPaid: 1,
            });
          });
          succeeded.push(customerId);
        } catch (err) {
          failed.push({
            customerId,
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
