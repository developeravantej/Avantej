/**
 * Packages Router
 *
 * API endpoints for listing package product definitions in tenant organizations.
 * Requires service_management read for staff; list can be scoped by branch.
 */

import {
  listPackages,
  getPackageById,
  createPackage,
  updatePackage,
  archivePackage,
  getDescendantNodeIds,
  requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

const appointmentTypeSchema = z.enum(["private", "semi-private", "both"]);

export const packagesRouter = {
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        branchId: z.string().uuid().nullable().optional(),
        appointmentType: appointmentTypeSchema.optional(),
        isArchived: z.boolean().optional(),
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

      const items = await listPackages(context.tenantDb, {
        branchId: input.branchId ?? undefined,
        appointmentType: input.appointmentType,
        isArchived: input.isArchived,
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

      const pkg = await getPackageById(context.tenantDb, input.id);
      if (!pkg) {
        throw new ORPCError("NOT_FOUND", {
          message: "Package not found",
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
      if (pkg.branchId && !accessibleNodeIds.includes(pkg.branchId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this package",
        });
      }

      return pkg;
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().min(1).max(255),
        appointmentType: appointmentTypeSchema,
        crossUsageEnabled: z.boolean().optional(),
        sessionCount: z.number().int().min(1),
        pricePerSession: z.number().int().min(0),
        maxClientsPerSession: z.number().int().min(1),
        expiryDays: z.number().int().min(1).optional(),
        expiryDate: z.string().datetime().optional(),
        autoGenerateInvoice: z.boolean().optional(),
        branchId: z.string().uuid().optional(),
        allowedServiceIds: z.array(z.string().uuid()).optional(),
      }).refine(
        (data) => !(data.expiryDays !== undefined && data.expiryDate !== undefined),
        { message: "Provide either expiryDays or expiryDate, not both" }
      )
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant database not available." });
      if (!context.member) throw new ORPCError("FORBIDDEN", { message: "User is not a member of this organization" });
      try {
        await requirePermission(context.tenantDb, context.member, "service_management", "create");
      } catch (error) {
        throw new ORPCError("FORBIDDEN", { message: error instanceof Error ? error.message : "Permission denied" });
      }
      try {
        return await createPackage(context.tenantDb, {
          name: input.name,
          appointmentType: input.appointmentType,
          crossUsageEnabled: input.crossUsageEnabled,
          sessionCount: input.sessionCount,
          pricePerSession: input.pricePerSession,
          maxClientsPerSession: input.maxClientsPerSession,
          expiryDays: input.expiryDays,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          autoGenerateInvoice: input.autoGenerateInvoice,
          branchId: input.branchId,
          allowedServiceIds: input.allowedServiceIds,
        });
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", { message: error instanceof Error ? error.message : "Failed to create package" });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        appointmentType: appointmentTypeSchema.optional(),
        crossUsageEnabled: z.boolean().optional(),
        sessionCount: z.number().int().min(1).optional(),
        pricePerSession: z.number().int().min(0).optional(),
        maxClientsPerSession: z.number().int().min(1).optional(),
        expiryDays: z.number().int().min(1).nullable().optional(),
        expiryDate: z.string().datetime().nullable().optional(),
        autoGenerateInvoice: z.boolean().optional(),
        branchId: z.string().uuid().nullable().optional(),
        allowedServiceIds: z.array(z.string().uuid()).nullable().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant database not available." });
      if (!context.member) throw new ORPCError("FORBIDDEN", { message: "User is not a member of this organization" });
      try {
        await requirePermission(context.tenantDb, context.member, "service_management", "update");
      } catch (error) {
        throw new ORPCError("FORBIDDEN", { message: error instanceof Error ? error.message : "Permission denied" });
      }
      const { organizationId: _org, id, ...rest } = input;
      const updated = await updatePackage(context.tenantDb, id, {
        ...rest,
        expiryDate: rest.expiryDate === null ? null : rest.expiryDate ? new Date(rest.expiryDate) : undefined,
      });
      if (!updated) throw new ORPCError("NOT_FOUND", { message: "Package not found" });
      return updated;
    }),

  archive: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant database not available." });
      if (!context.member) throw new ORPCError("FORBIDDEN", { message: "User is not a member of this organization" });
      try {
        await requirePermission(context.tenantDb, context.member, "service_management", "delete");
      } catch (error) {
        throw new ORPCError("FORBIDDEN", { message: error instanceof Error ? error.message : "Permission denied" });
      }
      const archived = await archivePackage(context.tenantDb, input.id);
      if (!archived) throw new ORPCError("NOT_FOUND", { message: "Package not found" });
      return archived;
    }),
};
