import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {

	listProductCategories,
	getProductCategoryById,
	createProductCategory,
	updateProductCategory,
	deleteProductCategory,
} from "@avantej-core/services";

export const productCategoriesRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				search: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "read")

			return listProductCategories(context.tenantDb, { search: input.search });
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

			const category = await getProductCategoryById(context.tenantDb, input.id);
			if (!category) {
				throw new ORPCError("NOT_FOUND", {
					message: `Product category not found: ${input.id}`,
				});
			}
			return category;
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				externalCode: z.string().optional(),
				description: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "create")

			return createProductCategory(context.tenantDb, {
				name: input.name,
				externalCode: input.externalCode,
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
				externalCode: z.string().optional(),
				description: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "update")

			return updateProductCategory(context.tenantDb, input.id, {
				name: input.name,
				externalCode: input.externalCode,
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

			return deleteProductCategory(context.tenantDb, input.id);
		}),
};
