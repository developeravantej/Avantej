/**
 * Packages Router
 *
 * API endpoints for listing package product definitions in tenant organizations.
 * Requires service_management read for staff; list can be scoped by branch.
 */

import {
  listPackages,
  getPackageById,
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
};
