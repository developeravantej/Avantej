import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
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
	resolveProductPrice,
	listProductPriceOverrides,
	setProductPrice,
	expireProductPrice,
	deleteProductPrice,
} from "@avantej-core/services";
import { productPrices } from "@avantej-core/db/schema/tenant/product-prices";

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
				createdBy: context.session?.user?.id ?? null,
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
				updatedBy: context.session?.user?.id ?? null,
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

	// #region Agent 2.2 — branch pricing (J2)
	resolvePrice: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				productId: z.string().uuid(),
				branchId: z.string().uuid().nullable().optional(),
				customerType: z.string().nullable().optional(),
			}),
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
			const priceCents = await resolveProductPrice(
				context.tenantDb,
				input.productId,
				input.branchId ?? null,
				input.customerType ?? null,
			);
			return { priceCents };
		}),

	listPriceOverrides: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				productId: z.string().uuid(),
			}),
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
			return listProductPriceOverrides(context.tenantDb, input.productId);
		}),

	setBranchPrice: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				productId: z.string().uuid(),
				branchId: z.string().uuid().nullable(),
				customerType: z.string().nullable().optional(),
				priceCents: z.number().int().min(0),
				effectiveFrom: z.string().datetime().optional(),
				effectiveUntil: z.string().datetime().nullable().optional(),
			}),
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
			return setProductPrice(context.tenantDb, {
				productId: input.productId,
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
			}),
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
			const [priceRow] = await context.tenantDb
				.select({ id: productPrices.id, productId: productPrices.productId })
				.from(productPrices)
				.where(eq(productPrices.id, input.priceId))
				.limit(1);
			if (!priceRow) {
				throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
			}
			const product = await getProductById(context.tenantDb, priceRow.productId);
			if (!product) {
				throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
			}
			await expireProductPrice(
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
			}),
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
				await requirePermission(context.tenantDb, context.member, "inventory", "delete");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}
			const [priceRow] = await context.tenantDb
				.select({ id: productPrices.id, productId: productPrices.productId })
				.from(productPrices)
				.where(eq(productPrices.id, input.priceId))
				.limit(1);
			if (!priceRow) {
				throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
			}
			const product = await getProductById(context.tenantDb, priceRow.productId);
			if (!product) {
				throw new ORPCError("NOT_FOUND", { message: "Price override not found" });
			}
			await deleteProductPrice(context.tenantDb, input.priceId);
			return { success: true };
		}),
	// #endregion
};
