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
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { desc, and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

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
        clientId: z.string(),
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
        paymentPlanType: z.enum(["full", "half", "quarterly"]).nullable().optional(),
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
        const isInstallmentPlan = input.paymentPlanType && input.paymentPlanType !== "full";
        const created = await createPackageInstance(context.tenantDb, {
          serviceId: input.serviceId,
          clientId: input.clientId,
          source: input.source,
          assignedBy: input.assignedBy ?? null,
          purchaseNumber: input.purchaseNumber ?? null,
          paymentId: input.paymentId ?? null,
          totalPrice: input.totalPrice ?? null,
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
          installmentsTotal: input.paymentPlanType === "half" ? 2 : input.paymentPlanType === "quarterly" ? 4 : 1,
          installmentsPaid: 0,
          creditsUnlocked: isInstallmentPlan ? 0 : null,
        });

        // Generate installment schedule if payment plan provided
        if (isInstallmentPlan) {
          const intervalDays = input.installmentIntervalDays ?? 30;
          await createInstallmentSchedule(context.tenantDb, {
            packageInstanceId: created.id,
            creditsTotal: created.creditsTotal,
            totalPrice: created.totalPrice ?? 0,
            taxAmount: created.taxAmount ?? 0,
            paymentPlanType: input.paymentPlanType!,
            intervalDays,
            purchaseDate: new Date(),
          });
        }

        return created;
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error ? error.message : "Failed to create package instance",
        });
      }
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

      return rows;
    }),
};
