/**
 * Services Router
 *
 * API endpoints for managing services in tenant organizations.
 * Requires service_management permission for create/update; read for list/getById.
 */

import {
  listServices,
  getServiceById,
  createService,
  duplicateService,
  updateService,
  getDescendantNodeIds,
  requirePermission,
  resolveServicePrice,
  listServicePriceOverrides,
  setServicePrice,
  expireServicePrice,
  deleteServicePrice,
  revenueShareByCategory,
  avgSessionsSoldPerMonth,
  listServicesWithTrainerTiers,
} from "@avantej-core/services";
import { servicePrices } from "@avantej-core/db/schema/tenant/service-prices";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

const serviceTypeSchema = z.enum(["private", "semi_private", "both"]);
const schedulingTypeSchema = z.enum(["appointment", "class_slot"]);
const priceUnitSchema = z.enum(["session", "class", "package"]);
const durationUnitSchema = z.enum(["seconds", "minutes", "hours"]);

const timePresetConfigSchema = z
  .object({
    recurringDays: z.array(z.string()).min(1),
    timeSlotsPerDay: z.record(z.string(), z.array(z.string()).min(1)),
  })
  .nullable();

export const servicesRouter = {
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        categoryId: z.string().uuid().nullable().optional(),
        branchId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
        type: serviceTypeSchema.optional(),
        schedulingType: schedulingTypeSchema.optional(),
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

      // Clients can read services in their tenant; staff need service_management:read.
      if (context.member.role !== "client") {
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
      }

      const accessibleNodeIds =
        context.accessibleNodeIds ??
        (context.member
          ? await getDescendantNodeIds(
              context.tenantDb,
              context.member.hierarchyScopeId
            )
          : []);

      const items = await listServices(context.tenantDb, {
        categoryId: input.categoryId ?? undefined,
        branchId: input.branchId ?? undefined,
        isActive: input.isActive,
        type: input.type,
        schedulingType: input.schedulingType,
        accessibleNodeIds,
      });

      return items;
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

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Clients can read services in their tenant; staff need service_management:read.
      if (context.member.role !== "client") {
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
      }

      const service = await getServiceById(context.tenantDb, input.id);
      if (!service) {
        throw new ORPCError("NOT_FOUND", {
          message: "Service not found",
        });
      }

      const accessibleNodeIds =
        context.accessibleNodeIds ??
        (context.member
          ? await getDescendantNodeIds(
              context.tenantDb,
              context.member.hierarchyScopeId
            )
          : []);
      if (service.branchId && !accessibleNodeIds.includes(service.branchId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this service",
        });
      }

      return service;
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().min(1),
        categoryId: z.string().uuid().nullable().optional(),
        duration: z.number().int().min(1),
        durationUnitType: durationUnitSchema.optional(),
        maxAttendees: z.number().int().min(0),
        attendanceThreshold: z.number().int().min(0).nullable().optional(),
        branchId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        type: serviceTypeSchema.optional(),
        price: z.number().int().min(0).nullable().optional(),
        priceUnit: priceUnitSchema.optional(),
        taxable: z.boolean().optional(),
        taxPercentage: z.number().int().min(0).max(100).optional(),
        isRecommended: z.boolean().optional(),
        location: z.string().nullable().optional(),
        features: z.array(z.string()).nullable().optional(),
        schedulingType: schedulingTypeSchema.optional(),
        sessionCount: z.number().int().min(1).nullable().optional(),
        expirable: z.boolean().optional(),
        expiryDays: z.number().int().min(1).nullable().optional(),
        expiryDate: z.string().datetime().nullable().optional(),
        availablePaymentPlans: z.array(z.string()).optional(),
        installmentIntervalDays: z.number().int().min(1).optional(),
        gracePeriodDays: z.number().int().min(0).max(90).nullish(),
        defaultCommissionBps: z.number().int().min(0).max(100_000).optional(),
        timePresetConfig: timePresetConfigSchema.optional(),
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

      if (input.branchId) {
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (context.member
            ? await getDescendantNodeIds(
                context.tenantDb,
                context.member.hierarchyScopeId
              )
            : []);
        if (!accessibleNodeIds.includes(input.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to this branch",
          });
        }
      }

      // Validate each plan code exists and is active
      if (input.availablePaymentPlans && input.availablePaymentPlans.length > 0) {
        for (const code of input.availablePaymentPlans) {
          const plan = await context.tenantDb.query.installmentPlans.findFirst({
            where: and(
              eq(installmentPlans.code, code),
              eq(installmentPlans.isActive, true),
            ),
          });
          if (!plan) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Unknown installment plan: ${code}`,
            });
          }
        }
      }

      try {
        const created = await createService(context.tenantDb, {
          name: input.name,
          categoryId: input.categoryId ?? null,
          duration: input.duration,
          durationUnitType: input.durationUnitType,
          maxAttendees: input.maxAttendees,
          attendanceThreshold: input.attendanceThreshold ?? null,
          branchId: input.branchId ?? null,
          isActive: input.isActive,
          title: input.title ?? null,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          type: input.type,
          price: input.price ?? null,
          priceUnit: input.priceUnit,
          taxable: input.taxable,
          taxPercentage: input.taxPercentage,
          isRecommended: input.isRecommended,
          location: input.location ?? null,
          features: input.features ?? null,
          schedulingType: input.schedulingType,
          sessionCount: input.sessionCount ?? null,
          expirable: input.expirable,
          expiryDays: input.expiryDays ?? null,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          ...(input.availablePaymentPlans !== undefined ? { availablePaymentPlans: input.availablePaymentPlans } : {}),
          ...(input.installmentIntervalDays !== undefined ? { installmentIntervalDays: input.installmentIntervalDays } : {}),
          ...(input.gracePeriodDays !== undefined ? { gracePeriodDays: input.gracePeriodDays ?? null } : {}),
          ...(input.defaultCommissionBps !== undefined ? { defaultCommissionBps: input.defaultCommissionBps } : {}),
          ...(input.timePresetConfig !== undefined ? { timePresetConfig: input.timePresetConfig } : {}),
          createdBy: context.session?.user?.id ?? null,
        } as Parameters<typeof createService>[1]);
        return created;
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to create service",
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        duration: z.number().int().min(1).optional(),
        durationUnitType: durationUnitSchema.optional(),
        maxAttendees: z.number().int().min(0).optional(),
        attendanceThreshold: z.number().int().min(0).nullable().optional(),
        branchId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        type: serviceTypeSchema.optional(),
        price: z.number().int().min(0).nullable().optional(),
        priceUnit: priceUnitSchema.optional(),
        taxable: z.boolean().optional(),
        taxPercentage: z.number().int().min(0).max(100).optional(),
        isRecommended: z.boolean().optional(),
        location: z.string().nullable().optional(),
        features: z.array(z.string()).nullable().optional(),
        schedulingType: schedulingTypeSchema.optional(),
        sessionCount: z.number().int().min(1).nullable().optional(),
        expirable: z.boolean().optional(),
        expiryDays: z.number().int().min(1).nullable().optional(),
        expiryDate: z.string().datetime().nullable().optional(),
        availablePaymentPlans: z.array(z.string()).optional(),
        installmentIntervalDays: z.number().int().min(1).optional(),
        gracePeriodDays: z.number().int().min(0).max(90).nullish(),
        defaultCommissionBps: z.number().int().min(0).max(100_000).optional(),
        timePresetConfig: timePresetConfigSchema.optional(),
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
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const existing = await getServiceById(context.tenantDb, input.id);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Service not found",
        });
      }

      const accessibleNodeIds =
        context.accessibleNodeIds ??
        (context.member
          ? await getDescendantNodeIds(
              context.tenantDb,
              context.member.hierarchyScopeId
            )
          : []);
      if (existing.branchId && !accessibleNodeIds.includes(existing.branchId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this service",
        });
      }

      if (input.branchId !== undefined && input.branchId !== null) {
        if (!accessibleNodeIds.includes(input.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to target branch",
          });
        }
      }

      // Validate each plan code exists and is active
      if (input.availablePaymentPlans && input.availablePaymentPlans.length > 0) {
        for (const code of input.availablePaymentPlans) {
          const plan = await context.tenantDb.query.installmentPlans.findFirst({
            where: and(
              eq(installmentPlans.code, code),
              eq(installmentPlans.isActive, true),
            ),
          });
          if (!plan) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Unknown installment plan: ${code}`,
            });
          }
        }
      }

      try {
        const updated = await updateService(
          context.tenantDb,
          input.id,
          {
            name: input.name,
            categoryId: input.categoryId,
            duration: input.duration,
            durationUnitType: input.durationUnitType,
            maxAttendees: input.maxAttendees,
            attendanceThreshold: input.attendanceThreshold,
            branchId: input.branchId,
            isActive: input.isActive,
            title: input.title,
            description: input.description,
            imageUrl: input.imageUrl,
            type: input.type,
            price: input.price,
            priceUnit: input.priceUnit,
            taxable: input.taxable,
            taxPercentage: input.taxPercentage,
            isRecommended: input.isRecommended,
            location: input.location,
            features: input.features,
            schedulingType: input.schedulingType,
            sessionCount: input.sessionCount,
            expirable: input.expirable,
            expiryDays: input.expiryDays,
            expiryDate: input.expiryDate !== undefined
              ? input.expiryDate === null ? null : new Date(input.expiryDate)
              : undefined,
            ...(input.availablePaymentPlans !== undefined ? { availablePaymentPlans: input.availablePaymentPlans } : {}),
            ...(input.installmentIntervalDays !== undefined ? { installmentIntervalDays: input.installmentIntervalDays } : {}),
            ...(input.gracePeriodDays !== undefined ? { gracePeriodDays: input.gracePeriodDays ?? null } : {}),
            ...(input.defaultCommissionBps !== undefined ? { defaultCommissionBps: input.defaultCommissionBps } : {}),
            ...(input.timePresetConfig !== undefined ? { timePresetConfig: input.timePresetConfig } : {}),
            updatedBy: context.session?.user?.id ?? null,
            } as Parameters<typeof updateService>[2]
        );
        return updated;
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to update service",
        });
      }
    }),

  // #region duplicate
  duplicate: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
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
          "create"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      try {
        return await duplicateService(context.tenantDb, input.id, {
          createdBy: context.session?.user?.id ?? null,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Service not found") {
          throw new ORPCError("NOT_FOUND", { message: "Service not found" });
        }
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to duplicate service",
        });
      }
    }),
  // #endregion

  // #region Agent 2.2 — branch pricing (J2)
  resolvePrice: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        serviceId: z.string().uuid(),
        branchId: z.string().uuid().nullable().optional(),
        customerType: z.string().nullable().optional(),
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
      const priceCents = await resolveServicePrice(
        context.tenantDb,
        input.serviceId,
        input.branchId ?? null,
        input.customerType ?? null,
      );
      return { priceCents };
    }),

  listPriceOverrides: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        serviceId: z.string().uuid(),
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
      if (context.member.role !== "client") {
        try {
          await requirePermission(
            context.tenantDb,
            context.member,
            "service_management",
            "read",
          );
        } catch (error) {
          throw new ORPCError("FORBIDDEN", {
            message: error instanceof Error ? error.message : "Permission denied",
          });
        }
      }
      return listServicePriceOverrides(context.tenantDb, input.serviceId);
    }),

  setBranchPrice: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        serviceId: z.string().uuid(),
        branchId: z.string().uuid().nullable(),
        customerType: z.string().nullable().optional(),
        priceCents: z.number().int().min(0),
        effectiveFrom: z.string().datetime().optional(),
        effectiveUntil: z.string().datetime().nullable().optional(),
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
          "update",
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }
      // Branch-access check when scoped to a branch
      if (input.branchId) {
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (context.member
            ? await getDescendantNodeIds(
                context.tenantDb,
                context.member.hierarchyScopeId,
              )
            : []);
        if (!accessibleNodeIds.includes(input.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to this branch",
          });
        }
      }
      return setServicePrice(context.tenantDb, {
        serviceId: input.serviceId,
        branchId: input.branchId,
        customerType: input.customerType ?? null,
        priceCents: input.priceCents,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
        effectiveUntil:
          input.effectiveUntil === undefined
            ? undefined
            : input.effectiveUntil === null
              ? null
              : new Date(input.effectiveUntil),
      });
    }),

  expireBranchPrice: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        priceId: z.string().uuid(),
        effectiveUntil: z.string().datetime().optional(),
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
          "update",
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }
      const [priceRow] = await context.tenantDb
        .select({ id: servicePrices.id, serviceId: servicePrices.serviceId })
        .from(servicePrices)
        .where(eq(servicePrices.id, input.priceId))
        .limit(1);
      if (!priceRow) {
        throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
      }
      const svc = await getServiceById(context.tenantDb, priceRow.serviceId);
      if (!svc) {
        throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
      }
      if (svc.branchId) {
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (context.member
            ? await getDescendantNodeIds(context.tenantDb, context.member.hierarchyScopeId)
            : []);
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
        }
      }
      await expireServicePrice(
        context.tenantDb,
        input.priceId,
        input.effectiveUntil ? new Date(input.effectiveUntil) : undefined,
      );
      return { success: true };
    }),

  deleteBranchPrice: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        priceId: z.string().uuid(),
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
          "delete",
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }
      const [priceRow] = await context.tenantDb
        .select({ id: servicePrices.id, serviceId: servicePrices.serviceId })
        .from(servicePrices)
        .where(eq(servicePrices.id, input.priceId))
        .limit(1);
      if (!priceRow) {
        throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
      }
      const svc = await getServiceById(context.tenantDb, priceRow.serviceId);
      if (!svc) {
        throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
      }
      if (svc.branchId) {
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (context.member
            ? await getDescendantNodeIds(context.tenantDb, context.member.hierarchyScopeId)
            : []);
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
        }
      }
      await deleteServicePrice(context.tenantDb, input.priceId);
      return { success: true };
    }),
  // #endregion

  // #region 1.24 — revenueShareByCategory
  revenueShareByCategory: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database not available.",
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

      const accessibleNodeIds =
        context.accessibleNodeIds ??
        (context.member
          ? await getDescendantNodeIds(
              context.tenantDb,
              context.member.hierarchyScopeId
            )
          : []);

      const from = new Date(input.from);
      const to = new Date(input.to);

      try {
        return await revenueShareByCategory(context.tenantDb, {
          from,
          to,
          accessibleNodeIds,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error as NodeJS.ErrnoException & { code?: string }).code === "BAD_REQUEST"
        ) {
          throw new ORPCError("BAD_REQUEST", { message: error.message });
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: error instanceof Error ? error.message : "Failed to compute revenue share",
        });
      }
    }),
  // #endregion

  // #region 1.25 — avgSessionsSoldPerMonth
  avgSessionsSoldPerMonth: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        serviceId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database not available.",
        });
      }
      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }
      if (context.member.role !== "client") {
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
      }
      return avgSessionsSoldPerMonth(context.tenantDb, {
        serviceId: input.serviceId,
      });
    }),
  // #endregion

  // #region 1.26 — listWithTrainerTiers
  listWithTrainerTiers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        categoryId: z.string().uuid().nullable().optional(),
        branchId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
        type: serviceTypeSchema.optional(),
        schedulingType: schedulingTypeSchema.optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database not available.",
        });
      }
      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }
      if (context.member.role !== "client") {
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
      }

      const accessibleNodeIds =
        context.accessibleNodeIds ??
        (context.member
          ? await getDescendantNodeIds(
              context.tenantDb,
              context.member.hierarchyScopeId
            )
          : []);

      return listServicesWithTrainerTiers(context.tenantDb, {
        categoryId: input.categoryId ?? undefined,
        branchId: input.branchId ?? undefined,
        isActive: input.isActive,
        type: input.type,
        schedulingType: input.schedulingType,
        accessibleNodeIds,
      });
    }),
  // #endregion
};
