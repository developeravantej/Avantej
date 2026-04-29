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
const statusSchema = z.enum(["active", "expired", "exhausted", "cancelled"]);

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

      if (isClient) {
        return instance;
      }

      if (isStaff) {
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
        return instance;
      }

      throw new ORPCError("FORBIDDEN", {
        message: "Access denied",
      });
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
          status: input.status,
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
};
