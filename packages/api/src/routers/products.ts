import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	requirePermission,
	listProducts,
	getProductById,
	createProduct,
	updateProduct,
	getProductStock,
	adjustStock as adjustProductStock,
} from "@avantej-core/services";

const productTypeEnum = z.enum(["product", "service_item"]);
const productStatusEnum = z.enum(["active", "inactive", "discontinued"]);

export const productsRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				brandId: z.string().uuid().optional(),
				categoryId: z.string().uuid().optional(),
				supplierId: z.string().uuid().optional(),
				status: productStatusEnum.optional(),
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

			try {
				await requirePermission(context.tenantDb, context.member, "inventory", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return listProducts(context.tenantDb, {
				brandId: input.brandId,
				categoryId: input.categoryId,
				supplierId: input.supplierId,
				status: input.status,
				search: input.search,
			});
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

			try {
				await requirePermission(context.tenantDb, context.member, "inventory", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const product = await getProductById(context.tenantDb, input.id);
			if (!product) {
				throw new ORPCError("NOT_FOUND", {
					message: `Product not found: ${input.id}`,
				});
			}
			return product;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				sku: z.string().min(1),
				name: z.string().min(1),
				barcode: z.string().optional(),
				type: productTypeEnum.optional(),
				brandId: z.string().uuid().optional(),
				categoryId: z.string().uuid().optional(),
				supplierId: z.string().uuid().optional(),
				uomId: z.string().uuid(),
				conversionFactor: z.string().optional(),
				price: z.number().int().min(0),
				status: productStatusEnum.optional(),
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
				await requirePermission(context.tenantDb, context.member, "inventory", "create");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return createProduct(context.tenantDb, {
				sku: input.sku,
				name: input.name,
				barcode: input.barcode,
				type: input.type,
				brandId: input.brandId,
				categoryId: input.categoryId,
				supplierId: input.supplierId,
				uomId: input.uomId,
				conversionFactor: input.conversionFactor,
				price: input.price,
				status: input.status,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				sku: z.string().optional(),
				name: z.string().optional(),
				barcode: z.string().optional(),
				type: productTypeEnum.optional(),
				brandId: z.string().uuid().optional(),
				categoryId: z.string().uuid().optional(),
				supplierId: z.string().uuid().optional(),
				uomId: z.string().uuid().optional(),
				conversionFactor: z.string().optional(),
				price: z.number().int().min(0).optional(),
				status: productStatusEnum.optional(),
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
				await requirePermission(context.tenantDb, context.member, "inventory", "update");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return updateProduct(context.tenantDb, input.id, {
				sku: input.sku,
				name: input.name,
				barcode: input.barcode,
				type: input.type,
				brandId: input.brandId,
				categoryId: input.categoryId,
				supplierId: input.supplierId,
				uomId: input.uomId,
				conversionFactor: input.conversionFactor,
				price: input.price,
				status: input.status,
			});
		}),

	getStock: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				productId: z.string().uuid(),
				branchId: z.string().uuid(),
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
				await requirePermission(context.tenantDb, context.member, "inventory", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return getProductStock(context.tenantDb, input.productId, input.branchId);
		}),

	adjustStock: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				productId: z.string().uuid(),
				branchId: z.string().uuid(),
				delta: z.number().int(),
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
				await requirePermission(context.tenantDb, context.member, "inventory", "update");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return adjustProductStock(context.tenantDb, input.productId, input.branchId, input.delta);
		}),
};
