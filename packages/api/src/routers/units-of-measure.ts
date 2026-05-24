import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {

	listUnitsOfMeasure,
	getUomById,
	createUom,
	updateUom,
	deleteUom,
} from "@avantej-core/services";

export const unitsOfMeasureRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				search: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "read")

			return listUnitsOfMeasure(context.tenantDb, { search: input.search });
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "read")

			const uom = await getUomById(context.tenantDb, input.id);
			if (!uom) {
				throw new ORPCError("NOT_FOUND", {
					message: `Unit of measure not found: ${input.id}`,
				});
			}
			return uom;
		}),

	create: tenantProcedure
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
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "create")

			return createUom(context.tenantDb, {
				name: input.name,
				description: input.description,
				baseUomId: input.baseUomId,
				conversionFactor: input.conversionFactor,
			});
		}),

	update: tenantProcedure
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
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "update")

			return updateUom(context.tenantDb, input.id, {
				name: input.name,
				description: input.description,
				baseUomId: input.baseUomId,
				conversionFactor: input.conversionFactor,
			});
		}),

	delete: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "delete")

			return deleteUom(context.tenantDb, input.id);
		}),
};
