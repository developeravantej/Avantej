import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {

	listUnitsOfMeasure,
	getUomById,
	createUom,
	updateUom,
	deleteUom,
} from "@avantej-core/services";

export const unitsOfMeasureRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				search: z.string().optional(),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "read")

			return listUnitsOfMeasure(context.tenantDb, { search: input.search });
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
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "read")

			const uom = await getUomById(context.tenantDb, input.id);
			if (!uom) {
				throw new ORPCError("NOT_FOUND", {
					message: `Unit of measure not found: ${input.id}`,
				});
			}
			return uom;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				description: z.string().optional(),
				baseUomId: z.string().uuid().optional(),
				conversionFactor: z.string().optional(),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "create")

			return createUom(context.tenantDb, {
				name: input.name,
				description: input.description,
				baseUomId: input.baseUomId,
				conversionFactor: input.conversionFactor,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().optional(),
				description: z.string().optional(),
				baseUomId: z.string().uuid().optional(),
				conversionFactor: z.string().optional(),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "update")

			return updateUom(context.tenantDb, input.id, {
				name: input.name,
				description: input.description,
				baseUomId: input.baseUomId,
				conversionFactor: input.conversionFactor,
			});
		}),

	delete: protectedProcedure
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

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "delete")

			return deleteUom(context.tenantDb, input.id);
		}),
};
