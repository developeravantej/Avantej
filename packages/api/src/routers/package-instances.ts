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
import { parseCursor, encodeCursor } from "../lib/cursor";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import { getControlPanelDb } from "../lib/context-helpers";
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

export const packageInstancesRouter = {
  /**
   * List package instances for the current user (client view). Uses session user id as client_id.
   */
  listForClient: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        status: statusSchema.optional(),
        source: sourceSchema.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      const clientId = context.session?.user?.id;
      if (!clientId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const items = await listPackageInstancesForClient(context.tenantDb, {
        clientId,
        status: input.status,
        source: input.source,
        limit: input.limit,
      });

      return items;
    }),

  /**
   * Get active package instance for client (e.g. dashboard fitness plan). Uses session user id.
   */
  getActiveForClient: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ context }) => {
      

      const clientId = context.session?.user?.id;
      if (!clientId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const items = await listPackageInstancesForClient(context.tenantDb, {
        clientId,
        status: "active",
        limit: 1,
      });

      return items[0] ?? null;
    }),

  getById: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      const instance = await getPackageInstanceById(context.tenantDb, input.id);
      if (!instance) {
        throw new ORPCError("NOT_FOUND", {
          message: "Package instance not found",
        });
      }

      const clientId = context.session?.user?.id;
      const isClient = clientId && instance.clientId === clientId;
      const isStaff = context.member;

      if (!isClient && !isStaff) {
        throw new ORPCError("FORBIDDEN", {
          message: "Access denied",
        });
      }

      if (isStaff && !isClient) {
        await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read");
      }

      // Enrich with assigned trainer name when present
      let assignedTrainerName: string | null = null;
      if (instance.assignedTrainerId) {
        try {
          const controlPanelDb = getControlPanelDb(context);
          // Resolve member → userId → user.name
          const [trainerMember] = await context.tenantDb
            .select({ userId: members.userId })
            .from(members)
            .where(eq(members.id, instance.assignedTrainerId));
          if (trainerMember) {
            const [trainerUser] = await controlPanelDb
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, trainerMember.userId));
            assignedTrainerName = trainerUser?.name ?? null;
          }
        } catch {
          // Non-critical — proceed without name
        }
      }

      // Enrich with preferred trainer name when present
      let preferredTrainerName: string | null = null;
      if (instance.preferredTrainerId) {
        try {
          const controlPanelDb = getControlPanelDb(context);
          const [prefMember] = await context.tenantDb
            .select({ userId: members.userId })
            .from(members)
            .where(eq(members.id, instance.preferredTrainerId));
          if (prefMember) {
            const [prefUser] = await controlPanelDb
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, prefMember.userId));
            preferredTrainerName = prefUser?.name ?? null;
          }
        } catch {
          // Non-critical — proceed without name
        }
      }

      return { ...instance, assignedTrainerName, preferredTrainerName };
    }),

  create: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        serviceId: z.string().uuid(),
        clientId: z.string().optional(),
        walkInCustomerId: z.string().uuid().optional(),
        source: sourceSchema,
        assignedBy: z.string().nullable().optional(),
        purchaseNumber: z.string().nullable().optional(),
        paymentId: z.string().uuid().nullable().optional(),
        totalPrice: z.number().int().min(0).nullable().optional(),
        taxAmount: z.number().int().min(0).optional(),
        paymentStatus: paymentStatusSchema.optional(),
        paymentMethod: z.string().nullable().optional(),
        eSignature: z.string().nullable().optional(),
        termsAgreedAt: z.string().datetime().nullable().optional(),
        creditsTotal: z.number().int().min(0),
        creditsUsed: z.number().int().min(0).optional(),
        startsAt: z.string().datetime(),
        expiresAt: z.string().datetime(),
        status: statusSchema.optional(),
        remark: z.string().nullable().optional(),
        paymentPlanType: z.string().nullable().optional(),
        installmentIntervalDays: z.number().int().min(1).optional(),
        preferredTrainerId: z.string().uuid().nullable().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

      await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "create")

      try {
        // Resolve installment plan from DB if a plan code is provided
        let planRow: typeof installmentPlans.$inferSelect | null = null;
        if (input.paymentPlanType) {
          planRow = await context.tenantDb.query.installmentPlans.findFirst({
            where: and(
              eq(installmentPlans.code, input.paymentPlanType),
              eq(installmentPlans.isActive, true),
            ),
          }) ?? null;
          if (!planRow) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Unknown installment plan: ${input.paymentPlanType}`,
            });
          }
        }

        const resolvedInstallmentsTotal = planRow?.numInstallments ?? 1;
        const isInstallmentPlan = planRow !== null && planRow.numInstallments > 1;
        // Interval precedence: explicit input overrides plan default
        const effectiveIntervalDays = input.installmentIntervalDays ?? planRow?.defaultIntervalDays ?? 30;

        // Apply installment plan price premium. Callers send the BASE/list price;
        // server scales by (10000 + price_premium_bps) / 10000 when a plan with a
        // non-zero premium is selected. See zplan/17-04_14-00_installment-premium/plan.md §4.3.
        const basePrice = input.totalPrice ?? null;
        const adjustedTotalPrice =
          basePrice != null && planRow && planRow.pricePremiumBps > 0
            ? Math.round((basePrice * (10000 + planRow.pricePremiumBps)) / 10000)
            : basePrice;

        // Build XOR owner — exactly one of clientId / walkInCustomerId must be provided
        const ownerField: { clientId: string } | { walkInCustomerId: string } =
          input.walkInCustomerId
            ? { walkInCustomerId: input.walkInCustomerId }
            : { clientId: input.clientId! };

        // Approval gate: customer-purchased packages start in `pending` status
        // when the org setting is enabled. Staff-assigned packages bypass.
        // Default: gate ON ("true") if the setting hasn't been written yet.
        let resolvedStatus = input.status;
        if (input.source === "purchased") {
          const gateValue = await getSetting(
            context.tenantDb,
            PACKAGE_APPROVAL_REQUIRED_KEY,
          );
          const gateEnabled = (gateValue ?? "true") === "true";
          if (gateEnabled) {
            resolvedStatus = "pending";
          }
        }

        const created = await createPackageInstance(context.tenantDb, {
          serviceId: input.serviceId,
          ...ownerField,
          source: input.source,
          assignedBy: input.assignedBy ?? null,
          purchaseNumber: input.purchaseNumber ?? null,
          paymentId: input.paymentId ?? null,
          totalPrice: adjustedTotalPrice,
          taxAmount: input.taxAmount ?? 0,
          paymentStatus: input.paymentStatus ?? "pending",
          paymentMethod: input.paymentMethod ?? null,
          eSignature: input.eSignature ?? null,
          termsAgreedAt: input.termsAgreedAt
            ? new Date(input.termsAgreedAt)
            : null,
          creditsTotal: input.creditsTotal,
          creditsUsed: input.creditsUsed ?? 0,
          startsAt: new Date(input.startsAt),
          expiresAt: new Date(input.expiresAt),
          status: resolvedStatus,
          remark: input.remark ?? null,
          paymentPlanType: input.paymentPlanType ?? null,
          installmentsTotal: resolvedInstallmentsTotal,
          installmentsPaid: 0,
          creditsUnlocked: isInstallmentPlan ? 0 : null,
          preferredTrainerId: input.preferredTrainerId ?? null,
        });

        // Installment schedule uses created.totalPrice which already includes any plan price premium
        // Generate installment schedule if payment plan is an installment plan (numInstallments > 1)
        if (isInstallmentPlan) {
          await createInstallmentSchedule(context.tenantDb, {
            packageInstanceId: created.id,
            creditsTotal: created.creditsTotal,
            totalPrice: created.totalPrice ?? 0,
            taxAmount: created.taxAmount ?? 0,
            installmentsTotal: resolvedInstallmentsTotal,
            intervalDays: effectiveIntervalDays,
            purchaseDate: new Date(),
          });
        }

        // Fan out notifications to branch admins + trainers when the package
        // landed in `pending` status (gate enabled + customer purchase).
        if (created.status === "pending") {
          try {
            await notifyStaffOfPendingPackage(context.tenantDb, created.id);
          } catch (err) {
            // Non-critical — log but don't fail the purchase.
            // eslint-disable-next-line no-console
            console.error(
              `notifyStaffOfPendingPackage failed for package ${created.id}:`,
              err,
            );
          }
        }

        return created;
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error ? error.message : "Failed to create package instance",
        });
      }
    }),

  /**
   * List memberships (package_instances) for the retention / membership view.
   *
   * Filter values:
   *   active       — status='active' AND expiresAt > NOW()
   *   expiring_7d  — status='active' AND expiresAt within 7 days
   *   expiring_30d — status='active' AND expiresAt within 30 days
   *   expired      — status='expired' OR expiresAt < NOW()
   *   frozen       — isLocked = TRUE
   *   all          — no additional predicate
   *
   * Requires: service_management:read permission.
   * RBAC: results scoped to caller's accessibleNodeIds via members.hierarchyScopeId.
   */
  listMemberships: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        filter: z
          .enum(["active", "expiring_7d", "expiring_30d", "expired", "frozen", "all"])
          .default("active"),
        branchId: z.string().uuid().optional(),
        serviceCategoryId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .handler(async ({ context, input }) => {
      

      

      await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read");

      // Pre-check: if caller supplied a branchId, it must be within their accessible scope
      if (
        input.branchId &&
        !(context.accessibleNodeIds ?? []).includes(input.branchId)
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "Requested branch is outside your accessible scope",
        });
      }

      const controlPanelDb = getControlPanelDb(context);

      return listMemberships(controlPanelDb, context.tenantDb, {
        filter: input.filter,
        branchId: input.branchId,
        serviceCategoryId: input.serviceCategoryId,
        accessibleNodeIds: context.accessibleNodeIds ?? [],
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * List expiring memberships within a given window (7 or 30 days).
   * Used by dashboard widgets to surface members whose packages are about to expire.
   * Requires: reports:read permission.
   */
  listExpiring: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        within: z.union([z.literal(7), z.literal(30)]),
      }),
    )
    .handler(async ({ context, input }) => {
      
      
      await requirePermissionOrpc(context.tenantDb, context.member, "reports", "read");

      const controlPanelDb = getControlPanelDb(context);
      return listExpiringMemberships(context.tenantDb, controlPanelDb, {
        within: input.within,
        accessibleNodeIds: context.accessibleNodeIds ?? [],
      });
    }),

  /**
   * List all package instances for an organization (admin view).
   * Supports optional filters by clientId, status, and source.
   */
  listAll: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        clientId: z.string().optional(),
        status: statusSchema.optional(),
        source: sourceSchema.optional(),
        limit: z.number().int().min(1).max(200).optional().default(100),
      })
    )
    .handler(async ({ input, context }) => {
      

      

      await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read")

      // Build filter conditions dynamically
      const conditions = [];
      if (input.clientId) conditions.push(eq(packageInstances.clientId, input.clientId));
      if (input.status) conditions.push(eq(packageInstances.status, input.status));
      if (input.source) conditions.push(eq(packageInstances.source, input.source));

      const rows = await context.tenantDb
        .select()
        .from(packageInstances)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(packageInstances.createdAt))
        .limit(input.limit);

      // Cross-DB: batch-lookup client names from control panel
      const controlPanelDb = getControlPanelDb(context);
      let userMap = new Map<string, string>();
      const clientIds = [...new Set(rows.map((r: any) => r.clientId).filter((id: any): id is string => id != null))];
      if (clientIds.length > 0) {
        const userRows = await controlPanelDb
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, clientIds as string[]));
        userMap = new Map(userRows.map((u) => [u.id, u.name]));
      }

      return rows.map((row: any) => ({
        ...row,
        clientName: row.clientId ? (userMap.get(row.clientId) ?? null) : null,
      }));
    }),

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
    }),

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
    }),

  /**
   * List packages awaiting trainer assignment. Returns enriched rows with
   * customer name (control-panel join), service name, branch name, and
   * purchase timestamp.
   *
   * - Admin: sees all pending packages in their accessible branches.
   * - Trainer: by default sees pending packages in their own branch.
   * - scope: "assignable_to_me" filters to caller's branch (default for trainers).
   */
  listPending: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        branchId: z.string().uuid().optional(),
        scope: z.enum(["all", "assignable_to_me"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      
      const callerRole = context.member.role;
      if (callerRole !== "admin" && callerRole !== "trainer") {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins and trainers can view pending packages",
        });
      }

      // Determine branch filter
      const accessibleNodeIds = context.accessibleNodeIds ?? [];
      const scope =
        input.scope ??
        (callerRole === "trainer" ? "assignable_to_me" : "all");

      const branchFilterIds: string[] | null = (() => {
        if (input.branchId) return [input.branchId];
        if (scope === "assignable_to_me") {
          // scope expanded 2026-05-12 — match notification fan-out (sales-pipeline-fixes session)
          // Previously filtered to context.member.hierarchyScopeId (single node), causing
          // parent-region trainers to receive notifications but see an empty queue.
          // Now uses accessibleNodeIds (full descendant set), matching notifyStaffOfPendingPackage.
          return accessibleNodeIds.length > 0 ? accessibleNodeIds : [context.member.hierarchyScopeId];
        }
        return accessibleNodeIds.length > 0 ? accessibleNodeIds : null;
      })();

      // Pull pending+purchased packages joined to service for name + branch.
      // We don't filter by branch in SQL because services with branchId=null
      // (org-wide services) would be excluded by inArray. Resolve the
      // effective branch per row in JS using the same fallback as
      // notifyStaffOfPendingPackage: service.branchId, else customer's
      // member.hierarchyScopeId.
      const rows = await context.tenantDb
        .select({
          id: packageInstances.id,
          clientId: packageInstances.clientId,
          serviceId: packageInstances.serviceId,
          totalPrice: packageInstances.totalPrice,
          creditsTotal: packageInstances.creditsTotal,
          createdAt: packageInstances.createdAt,
          preferredTrainerId: packageInstances.preferredTrainerId,
          serviceName: services.name,
          branchId: services.branchId,
          paymentMethod: packageInstances.paymentMethod,
          paymentStatus: packageInstances.paymentStatus,
        })
        .from(packageInstances)
        .leftJoin(services, eq(packageInstances.serviceId, services.id))
        .where(
          and(
            eq(packageInstances.status, "pending"),
            eq(packageInstances.source, "purchased"),
          ),
        )
        .orderBy(desc(packageInstances.createdAt))
        .limit(input.limit ?? 50);

      // Hydrate customer name (cross-DB) + customer's tenant member branch
      const controlPanelDb = getControlPanelDb(context);
      type PendingRow = (typeof rows)[number];
      const clientIds: string[] = [
        ...new Set<string>(
          rows
            .map((r: PendingRow) => r.clientId)
            .filter((id: string | null): id is string => !!id),
        ),
      ];
      let customerMap = new Map<string, { name: string; email: string }>();
      if (clientIds.length > 0) {
        const userRows = await controlPanelDb
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(inArray(user.id, clientIds));
        customerMap = new Map(
          userRows.map((u) => [u.id, { name: u.name, email: u.email }]),
        );
      }

      let memberBranchMap = new Map<string, string>();
      if (clientIds.length > 0) {
        const memberRows = await context.tenantDb
          .select({
            userId: members.userId,
            scopeId: members.hierarchyScopeId,
          })
          .from(members)
          .where(inArray(members.userId, clientIds));
        memberBranchMap = new Map(
          memberRows.map((m: { userId: string; scopeId: string }) => [
            m.userId,
            m.scopeId,
          ]),
        );
      }

      // Apply branch-filter in JS using the resolved effective branch.
      const filtered =
        branchFilterIds && branchFilterIds.length > 0
          ? rows.filter((r: PendingRow) => {
              const effectiveBranch =
                r.branchId ??
                (r.clientId ? memberBranchMap.get(r.clientId) : null);
              return effectiveBranch
                ? branchFilterIds.includes(effectiveBranch)
                : false;
            })
          : rows;

      // Batch-resolve preferred trainer names: members.id → members.userId → user.name
      const preferredTrainerIds: string[] = [
        ...new Set<string>(
          filtered
            .map((r: PendingRow) => r.preferredTrainerId)
            .filter((id: string | null): id is string => !!id),
        ),
      ];
      const preferredTrainerNameMap = new Map<string, string>();
      if (preferredTrainerIds.length > 0) {
        const trainerMemberRows = await context.tenantDb
          .select({ id: members.id, userId: members.userId })
          .from(members)
          .where(inArray(members.id, preferredTrainerIds));
        const trainerUserIds = trainerMemberRows.map(
          (m: { id: string; userId: string }) => m.userId,
        );
        if (trainerUserIds.length > 0) {
          const trainerUserRows = await controlPanelDb
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(inArray(user.id, trainerUserIds));
          const userIdToName = new Map(
            trainerUserRows.map((u) => [u.id, u.name]),
          );
          for (const m of trainerMemberRows) {
            const name = userIdToName.get(m.userId);
            if (name) preferredTrainerNameMap.set(m.id, name);
          }
        }
      }

      return filtered.map((r: PendingRow) => ({
        ...r,
        customerName: r.clientId
          ? (customerMap.get(r.clientId)?.name ?? null)
          : null,
        customerEmail: r.clientId
          ? (customerMap.get(r.clientId)?.email ?? null)
          : null,
        preferredTrainerName: r.preferredTrainerId
          ? (preferredTrainerNameMap.get(r.preferredTrainerId) ?? null)
          : null,
      }));
    }),

  /**
   * List package instances assigned to the calling trainer.
   *
   * Accessible to any authenticated member — returns only rows where
   * assignedTrainerId = context.member.id, so no extra permission is needed.
   *
   * Index: package_instances_assigned_trainer_status_idx (assigned_trainer_id, status)
   * — added in migration 0051_sales_pipeline_fixes.
   */
  listAssignedToMe: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["active", "frozen", "all"]).default("active"),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

      const limit = input.limit;

      // Decode cursor: "createdAt|id" shape (matches encodeCursor).
      const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;
      // parseCursor returns { changedAt, id } but we reuse the same encoding for createdAt.
      const cursor = parsedCursor
        ? { createdAt: parsedCursor.changedAt, id: parsedCursor.id }
        : null;

      const controlPanelDb = getControlPanelDb(context);

      // Fetch limit+1 rows so we can detect whether a next page exists.
      const rows = await listAssignedToMember(controlPanelDb, context.tenantDb, {
        memberId: context.member.id,
        status: input.status,
        cursor,
        limit: limit + 1,
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const lastItem = items.at(-1);
      const nextCursor =
        hasMore && lastItem
          ? encodeCursor(lastItem.createdAt, lastItem.id)
          : null;

      return { items, nextCursor };
    }),

  /**
   * Cancel a package instance (admin only).
   *
   * Idempotency: already-cancelled → CONFLICT (not silent).
   * Branch-scope: caller's accessibleNodeIds must include the instance's service branch.
   */
  cancel: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        reason: z.string().min(1).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      // Load instance to resolve branch for scope check
      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const cancellerUserId = context.session?.user?.id;
      if (!cancellerUserId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await cancelPackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: cancellerUserId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
          reason: input.reason,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "CONFLICT") throw new ORPCError("CONFLICT", { message: e.message });
        }
        throw err;
      }
    }),

  /**
   * Freeze an active package instance (admin only).
   *
   * `until` is optional — null means indefinitely frozen.
   * Only `active` packages may be frozen.
   */
  freeze: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        until: z.string().datetime().optional(),
        reason: z.string().min(1).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const freezerUserId = context.session?.user?.id;
      if (!freezerUserId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await freezePackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: freezerUserId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
          until: input.until ? new Date(input.until) : undefined,
          reason: input.reason,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
        }
        throw err;
      }
    }),

  /**
   * Unfreeze a frozen package instance, returning it to `active` (admin only).
   */
  unfreeze: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const unfreezerId = context.session?.user?.id;
      if (!unfreezerId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await unfreezePackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: unfreezerId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
        }
        throw err;
      }
    }),

  /**
   * Extend a package instance's expiry date (admin only).
   *
   * `addDays` must be 1–365. Terminal packages (cancelled/expired/completed)
   * and non-expirable packages (null expiresAt) are rejected.
   */
  extend: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        addDays: z.number().int().min(1).max(365),
        reason: z.string().min(1).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const extenderId = context.session?.user?.id;
      if (!extenderId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await extendPackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: extenderId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
          addDays: input.addDays,
          reason: input.reason,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
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
      if (accessibleNodeIds.length > 0 && !accessibleNodeIds.includes(input.branchId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Requested branch is outside your accessible scope",
        });
      }

      // Validate trainer if provided
      let trainerMember: typeof members.$inferSelect | null = null;
      if (input.trainerMemberId) {
        trainerMember = await context.tenantDb.query.members.findFirst({
          where: eq(members.id, input.trainerMemberId),
        }) ?? null;
        if (!trainerMember) {
          throw new ORPCError("NOT_FOUND", { message: "Trainer not found" });
        }
        if (trainerMember.status !== "active") {
          throw new ORPCError("BAD_REQUEST", { message: "Trainer is not active" });
        }
        if (trainerMember.role !== "trainer" && trainerMember.role !== "admin") {
          throw new ORPCError("BAD_REQUEST", { message: "Target member is not a trainer" });
        }
      }

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
              preferredTrainerId: trainerMember?.id ?? null,
              assignedTrainerId: trainerMember?.id ?? null,
              assignedTrainerAssignedBy: trainerMember ? callerUserId : null,
              assignedTrainerAssignedAt: trainerMember ? now : null,
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
    }),

  statusHistory: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .handler(async ({ input, context }) => {
      

      

      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "read");

      const limit = input.limit;
      const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

      const rawRows = await getPackageInstanceStatusHistory(
        context.tenantDb,
        input.packageInstanceId,
        { parsedCursor, limit },
      );

      const hasMore = rawRows.length > limit;
      const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
      const lastRow = pageRows.at(-1);
      const nextCursor =
        hasMore && lastRow ? encodeCursor(lastRow.changedAt, lastRow.id) : null;

      const userIds = [
        ...new Set(pageRows.map((r) => r.changedBy).filter((id) => id !== "system")),
      ];
      const cpDb = getControlPanelDb(context);
      const userRecords =
        userIds.length > 0
          ? await cpDb
              .select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
              .from(cpUsers)
              .where(inArray(cpUsers.id, userIds))
          : [];
      const nameMap = new Map(
        userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown User"]),
      );

      const rows = pageRows.map(({ changedBy, ...rest }) => ({
        ...rest,
        changedByName:
          changedBy === "system" ? "System" : (nameMap.get(changedBy) ?? "Unknown User"),
      }));

      return { rows, nextCursor };
    }),
};
