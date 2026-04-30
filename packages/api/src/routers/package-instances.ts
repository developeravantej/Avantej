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
  requirePermission,
} from "@avantej-core/services";
import { listMemberships } from "@avantej-core/services/package-instance.service";
import { getSetting } from "@avantej-core/services/organization-settings.service";
import {
  notifyStaffOfPendingPackage,
  notifyCustomerPackageAssigned,
  notifyCustomerPackageRejected,
  clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { services } from "@avantej-core/db/schema/tenant/services";
import { listExpiringMemberships } from "@avantej-core/services/memberships.service";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { user } from "@avantej-core/db/schema/auth";
import { desc, and, eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { getControlPanelDb } from "../lib/context-helpers";

const sourceSchema = z.enum(["assigned", "purchased"]);
const paymentStatusSchema = z.enum(["pending", "paid", "failed", "refunded"]);
const statusSchema = z.enum([
  "pending",
  "active",
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
  listForClient: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        status: statusSchema.optional(),
        source: sourceSchema.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

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
  getActiveForClient: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

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

  getById: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

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
        try {
          await requirePermission(
            context.tenantDb,
            context.member!,
            "service_management",
            "read"
          );
        } catch (error) {
          throw new ORPCError("FORBIDDEN", {
            message: error instanceof Error ? error.message : "Permission denied",
          });
        }
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

      return { ...instance, assignedTrainerName };
    }),

  create: protectedProcedure
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
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "service_management",
          "create"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
  listMemberships: protectedProcedure
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
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Member context required",
        });
      }

      await requirePermission(
        context.tenantDb,
        context.member,
        "service_management",
        "read",
      );

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
  listExpiring: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        within: z.union([z.literal(7), z.literal(30)]),
      }),
    )
    .handler(async ({ context, input }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database not available",
        });
      }
      if (!context.member) {
        throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
      }
      await requirePermission(context.tenantDb, context.member, "reports", "read");

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
  listAll: protectedProcedure
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
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "service_management",
          "read"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
      const clientIds = [...new Set(rows.map((r) => r.clientId).filter((id): id is string => id != null))];
      if (clientIds.length > 0) {
        const userRows = await controlPanelDb
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, clientIds));
        userMap = new Map(userRows.map((u) => [u.id, u.name]));
      }

      return rows.map((row) => ({
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
  assignTrainer: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceId: z.string().uuid(),
        trainerMemberId: z.string().uuid(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }
      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      const callerRole = context.member.role;
      const callerUserId = context.session?.user?.id ?? "";

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
        const updated = await context.tenantDb.transaction(async (tx) => {
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
  reject: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceId: z.string().uuid(),
        reason: z.string().max(500).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }
      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }
      if (context.member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can reject packages",
        });
      }

      const callerUserId = context.session?.user?.id ?? "";

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
      const updated = await context.tenantDb.transaction(async (tx) => {
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
   * List packages awaiting trainer assignment. Returns enriched rows with
   * customer name (control-panel join), service name, branch name, and
   * purchase timestamp.
   *
   * - Admin: sees all pending packages in their accessible branches.
   * - Trainer: by default sees pending packages in their own branch.
   * - scope: "assignable_to_me" filters to caller's branch (default for trainers).
   */
  listPending: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        branchId: z.string().uuid().optional(),
        scope: z.enum(["all", "assignable_to_me"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }
      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }
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
          return [context.member.hierarchyScopeId];
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
          serviceName: services.name,
          branchId: services.branchId,
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
      const clientIds = [
        ...new Set(
          rows.map((r) => r.clientId).filter((id): id is string => !!id),
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
        memberBranchMap = new Map(memberRows.map((m) => [m.userId, m.scopeId]));
      }

      // Apply branch-filter in JS using the resolved effective branch.
      const filtered =
        branchFilterIds && branchFilterIds.length > 0
          ? rows.filter((r) => {
              const effectiveBranch =
                r.branchId ??
                (r.clientId ? memberBranchMap.get(r.clientId) : null);
              return effectiveBranch
                ? branchFilterIds.includes(effectiveBranch)
                : false;
            })
          : rows;

      return filtered.map((r) => ({
        ...r,
        customerName: r.clientId
          ? (customerMap.get(r.clientId)?.name ?? null)
          : null,
        customerEmail: r.clientId
          ? (customerMap.get(r.clientId)?.email ?? null)
          : null,
      }));
    }),
};
