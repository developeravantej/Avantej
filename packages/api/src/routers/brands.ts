import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {

	listBrands,
	getBrandById,
	createBrand,
	updateBrand,
	deleteBrand,
} from "@avantej-core/services";

export const brandsRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				search: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "read")

			return listBrands(context.tenantDb, { search: input.search });
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

			const brand = await getBrandById(context.tenantDb, input.id);
			if (!brand) {
				throw new ORPCError("NOT_FOUND", {
					message: `Brand not found: ${input.id}`,
				});
			}
			return brand;
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				description: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "create")

			return createBrand(context.tenantDb, {
				name: input.name,
				description: input.description,
				createdBy: context.session?.user?.id ?? null,
			});
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().optional(),
				description: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "update")

			return updateBrand(context.tenantDb, input.id, {
				name: input.name,
				description: input.description,
				updatedBy: context.session?.user?.id ?? null,
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

			return deleteBrand(context.tenantDb, input.id);
		}),
};
