import { eq, and, asc, or, ilike, sql } from "drizzle-orm";
import { products } from "@avantej-core/db/schema/tenant/products";
import { productStock } from "@avantej-core/db/schema/tenant/product-stock";
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
};

export type UpdateProductParams = Partial<CreateProductParams>;

export async function listProducts(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		brandId?: string;
		categoryId?: string;
		supplierId?: string;
		status?: string;
		search?: string;
	} = {}
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
				ilike(products.barcode, `%${search}%`)
			)
		);
	}

	return tenantDb.query.products.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [asc(products.name)],
	});
}

export async function getProductById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<(typeof products.$inferSelect) | null> {
	const row = await tenantDb.query.products.findFirst({
		where: eq(products.id, id),
	});
	return row ?? null;
}

export async function createProduct(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateProductParams
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
	params: UpdateProductParams
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
			...(params.conversionFactor !== undefined && { conversionFactor: params.conversionFactor }),
			...(params.price !== undefined && { price: params.price }),
			...(params.status !== undefined && { status: params.status }),
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
	branchId: string
): Promise<(typeof productStock.$inferSelect) | null> {
	const row = await tenantDb.query.productStock.findFirst({
		where: and(
			eq(productStock.productId, productId),
			eq(productStock.branchId, branchId)
		),
	});
	return row ?? null;
}

export async function upsertProductStock(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	productId: string,
	branchId: string,
	quantity: number
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

export async function adjustStock(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	productId: string,
	branchId: string,
	delta: number
): Promise<typeof productStock.$inferSelect> {
	// Try atomic update first
	const [updated] = await tenantDb
		.update(productStock)
		.set({
			quantity: sql`${productStock.quantity} + ${delta}`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(productStock.productId, productId),
				eq(productStock.branchId, branchId)
			)
		)
		.returning();

	if (updated) {
		return updated;
	}

	// No existing record - insert with delta as initial quantity
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
	return row;
}
