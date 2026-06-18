import { ORPCError } from "@orpc/server";
import { eq, and, asc, or, ilike, sql } from "drizzle-orm";
import { products } from "@avantej-core/db/schema/tenant/products";
import { productStock } from "@avantej-core/db/schema/tenant/product-stock";
import { stockMovements } from "@avantej-core/db/schema/tenant/stock-movements";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type CreateProductParams = {
	sku: string;
	name: string;
	barcode?: string;
	type?: "product" | "service_item";
	brandId?: string;
	categoryId?: string;
	supplierId?: string;
	uomId: string;
	conversionFactor?: string;
	price: number;
	status?: "active" | "inactive" | "discontinued";
	createdBy?: string | null;
};

export type UpdateProductParams = Partial<CreateProductParams> & {
	updatedBy?: string | null;
};

export async function listProducts(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		brandId?: string;
		categoryId?: string;
		supplierId?: string;
		status?: string;
		search?: string;
	} = {},
): Promise<(typeof products.$inferSelect)[]> {
	const { brandId, categoryId, supplierId, status, search } = params;

	const conditions = [];
	if (brandId) {
		conditions.push(eq(products.brandId, brandId));
	}
	if (categoryId) {
		conditions.push(eq(products.categoryId, categoryId));
	}
	if (supplierId) {
		conditions.push(eq(products.supplierId, supplierId));
	}
	if (status) {
		conditions.push(eq(products.status, status));
	}
	if (search) {
		conditions.push(
			or(
				ilike(products.sku, `%${search}%`),
				ilike(products.name, `%${search}%`),
				ilike(products.barcode, `%${search}%`),
			),
		);
	}

	return tenantDb.query.products.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [asc(products.name)],
	});
}

export async function getProductById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof products.$inferSelect | null> {
	const row = await tenantDb.query.products.findFirst({
		where: eq(products.id, id),
	});
	return row ?? null;
}

export async function createProduct(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateProductParams,
): Promise<typeof products.$inferSelect> {
	const [row] = await tenantDb
		.insert(products)
		.values({
			sku: params.sku,
			name: params.name,
			barcode: params.barcode ?? null,
			type: params.type ?? "product",
			brandId: params.brandId ?? null,
			categoryId: params.categoryId ?? null,
			supplierId: params.supplierId ?? null,
			uomId: params.uomId,
			conversionFactor: params.conversionFactor ?? "1",
			price: params.price,
			status: params.status ?? "active",
			createdBy: params.createdBy ?? null,
			updatedBy: params.createdBy ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create product");
	}
	return row;
}

export async function updateProduct(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: UpdateProductParams,
): Promise<typeof products.$inferSelect> {
	const [row] = await tenantDb
		.update(products)
		.set({
			...(params.sku !== undefined && { sku: params.sku }),
			...(params.name !== undefined && { name: params.name }),
			...(params.barcode !== undefined && { barcode: params.barcode }),
			...(params.type !== undefined && { type: params.type }),
			...(params.brandId !== undefined && { brandId: params.brandId }),
			...(params.categoryId !== undefined && { categoryId: params.categoryId }),
			...(params.supplierId !== undefined && { supplierId: params.supplierId }),
			...(params.uomId !== undefined && { uomId: params.uomId }),
			...(params.conversionFactor !== undefined && {
				conversionFactor: params.conversionFactor,
			}),
			...(params.price !== undefined && { price: params.price }),
			...(params.status !== undefined && { status: params.status }),
			...(params.updatedBy !== undefined && { updatedBy: params.updatedBy }),
			updatedAt: new Date(),
		})
		.where(eq(products.id, id))
		.returning();

	if (!row) {
		throw new Error("Product not found");
	}
	return row;
}

export async function getProductStock(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	productId: string,
	branchId: string,
): Promise<typeof productStock.$inferSelect | null> {
	const row = await tenantDb.query.productStock.findFirst({
		where: and(
			eq(productStock.productId, productId),
			eq(productStock.branchId, branchId),
		),
	});
	return row ?? null;
}

export async function upsertProductStock(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	productId: string,
	branchId: string,
	quantity: number,
): Promise<typeof productStock.$inferSelect> {
	const [row] = await tenantDb
		.insert(productStock)
		.values({
			productId,
			branchId,
			quantity,
		})
		.onConflictDoUpdate({
			target: [productStock.productId, productStock.branchId],
			set: {
				quantity,
				updatedAt: new Date(),
			},
		})
		.returning();

	if (!row) {
		throw new Error("Failed to upsert product stock");
	}
	return row;
}

/**
 * Optional audit metadata for a stock movement (F-INV-06). When provided,
 * `adjustStock` appends a row to `stock_movements` recording the signed delta,
 * resulting quantity, a human reason, and the source document. All fields are
 * optional so existing callers remain backward-compatible — a default reason
 * of "adjustment" is used when none is supplied.
 */
export type StockMovementMeta = {
	reason?: string;
	sourceType?: string;
	sourceId?: string;
	actorUserId?: string;
};

export async function adjustStock(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	productId: string,
	branchId: string,
	delta: number,
	meta: StockMovementMeta = {},
): Promise<typeof productStock.$inferSelect> {
	// Try atomic update first.
	// For negative deltas, gate the UPDATE so quantity cannot go below zero.
	const [updated] = await tenantDb
		.update(productStock)
		.set({
			quantity: sql`${productStock.quantity} + ${delta}`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(productStock.productId, productId),
				eq(productStock.branchId, branchId),
				...(delta < 0 ? [sql`${productStock.quantity} + ${delta} >= 0`] : []),
			),
		)
		.returning();

	if (updated) {
		await recordStockMovement(tenantDb, {
			productId,
			branchId,
			delta,
			quantityAfter: updated.quantity,
			meta,
		});
		return updated;
	}

	// No row was updated. Distinguish two cases:
	// 1. Negative delta — either no row existed (no stock to deduct) or the
	//    constraint prevented going below zero (insufficient stock).
	if (delta < 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Insufficient stock for product ${productId} at branch ${branchId}`,
		});
	}

	// 2. Positive delta with no existing row — insert with delta as initial quantity.
	const [row] = await tenantDb
		.insert(productStock)
		.values({
			productId,
			branchId,
			quantity: delta,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to adjust stock");
	}

	await recordStockMovement(tenantDb, {
		productId,
		branchId,
		delta,
		quantityAfter: row.quantity,
		meta,
	});
	return row;
}

/**
 * Append an append-only audit row to `stock_movements`. Runs on whatever
 * client (tx or pool) the caller passed to `adjustStock`, so it commits in the
 * SAME transaction as the stock mutation.
 */
async function recordStockMovement(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	args: {
		productId: string;
		branchId: string;
		delta: number;
		quantityAfter: number;
		meta: StockMovementMeta;
	},
): Promise<void> {
	await tenantDb.insert(stockMovements).values({
		productId: args.productId,
		branchId: args.branchId,
		delta: args.delta,
		quantityAfter: args.quantityAfter,
		reason: args.meta.reason ?? "adjustment",
		sourceType: args.meta.sourceType ?? null,
		sourceId: args.meta.sourceId ?? null,
		actorUserId: args.meta.actorUserId ?? null,
	});
}
