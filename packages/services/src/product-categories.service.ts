import { eq, asc, ilike } from "drizzle-orm";
import { productCategories } from "@avantej-core/db/schema/tenant/product-categories";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export async function listProductCategories(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { search?: string } = {}
): Promise<(typeof productCategories.$inferSelect)[]> {
	const { search } = params;

	if (search) {
		return tenantDb.query.productCategories.findMany({
			where: ilike(productCategories.name, `%${search}%`),
			orderBy: [asc(productCategories.name)],
		});
	}

	return tenantDb.query.productCategories.findMany({
		orderBy: [asc(productCategories.name)],
	});
}

export async function getProductCategoryById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<(typeof productCategories.$inferSelect) | null> {
	const row = await tenantDb.query.productCategories.findFirst({
		where: eq(productCategories.id, id),
	});
	return row ?? null;
}

export async function createProductCategory(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { name: string; externalCode?: string; description?: string }
): Promise<typeof productCategories.$inferSelect> {
	const [row] = await tenantDb
		.insert(productCategories)
		.values({
			name: params.name,
			externalCode: params.externalCode ?? null,
			description: params.description ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create product category");
	}
	return row;
}

export async function updateProductCategory(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: { name?: string; externalCode?: string; description?: string }
): Promise<typeof productCategories.$inferSelect> {
	const [row] = await tenantDb
		.update(productCategories)
		.set({
			...(params.name !== undefined && { name: params.name }),
			...(params.externalCode !== undefined && { externalCode: params.externalCode }),
			...(params.description !== undefined && { description: params.description }),
			updatedAt: new Date(),
		})
		.where(eq(productCategories.id, id))
		.returning();

	if (!row) {
		throw new Error("Product category not found");
	}
	return row;
}

export async function deleteProductCategory(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<void> {
	await tenantDb.delete(productCategories).where(eq(productCategories.id, id));
}
