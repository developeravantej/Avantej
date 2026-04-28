/**
 * Service Categories Router
 *
 * API endpoints for managing service categories in tenant organizations.
 * Requires service_management permission for create/update; read for list/getById.
 */

import {
  listServiceCategories,
  getServiceCategoryById,
  createServiceCategory,
  updateServiceCategory,
  getDescendantNodeIds,
  requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const serviceCategoriesRouter = {
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        branchId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
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

      // Clients can read service categories in their tenant; staff need service_management:read.
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

      const categories = await listServiceCategories(context.tenantDb, {
        branchId: input.branchId ?? undefined,
        isActive: input.isActive,
        accessibleNodeIds,
      });

      return categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        displayOrder: c.displayOrder,
        branchId: c.branchId,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
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

      // Clients can read service categories in their tenant; staff need service_management:read.
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

      const category = await getServiceCategoryById(context.tenantDb, input.id);
      if (!category) {
        throw new ORPCError("NOT_FOUND", {
          message: "Service category not found",
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
      if (
        category.branchId &&
        !accessibleNodeIds.includes(category.branchId)
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this category",
        });
      }

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        displayOrder: category.displayOrder,
        branchId: category.branchId,
        isActive: category.isActive,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        displayOrder: z.number().int().min(0).optional(),
        branchId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
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

      try {
        const category = await createServiceCategory(context.tenantDb, {
          name: input.name,
          description: input.description ?? null,
          displayOrder: input.displayOrder,
          branchId: input.branchId ?? null,
          isActive: input.isActive,
        });
        return {
          id: category.id,
          name: category.name,
          description: category.description,
          displayOrder: category.displayOrder,
          branchId: category.branchId,
          isActive: category.isActive,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
        };
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to create category",
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        displayOrder: z.number().int().min(0).optional(),
        branchId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
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

      const existing = await getServiceCategoryById(context.tenantDb, input.id);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Service category not found",
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
      if (
        existing.branchId &&
        !accessibleNodeIds.includes(existing.branchId)
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this category",
        });
      }

      if (input.branchId !== undefined && input.branchId !== null) {
        if (!accessibleNodeIds.includes(input.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to target branch",
          });
        }
      }

      try {
        const category = await updateServiceCategory(
          context.tenantDb,
          input.id,
          {
            name: input.name,
            description: input.description,
            displayOrder: input.displayOrder,
            branchId: input.branchId,
            isActive: input.isActive,
          }
        );
        return {
          id: category.id,
          name: category.name,
          description: category.description,
          displayOrder: category.displayOrder,
          branchId: category.branchId,
          isActive: category.isActive,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
        };
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to update category",
        });
      }
    }),
};
