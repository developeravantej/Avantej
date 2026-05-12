import { eq, asc, ilike } from "drizzle-orm";
import { brands } from "@avantej-core/db/schema/tenant/brands";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export async function listBrands(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { search?: string } = {}
): Promise<(typeof brands.$inferSelect)[]> {
	const { search } = params;

	if (search) {
		return tenantDb.query.brands.findMany({
			where: ilike(brands.name, `%${search}%`),
			orderBy: [asc(brands.name)],
		});
	}

	return tenantDb.query.brands.findMany({
		orderBy: [asc(brands.name)],
	});
}

export async function getBrandById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<(typeof brands.$inferSelect) | null> {
	const row = await tenantDb.query.brands.findFirst({
		where: eq(brands.id, id),
	});
	return row ?? null;
}

export async function createBrand(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { name: string; description?: string; createdBy?: string | null }
): Promise<typeof brands.$inferSelect> {
	const [row] = await tenantDb
		.insert(brands)
		.values({
			name: params.name,
			description: params.description ?? null,
			createdBy: params.createdBy ?? null,
			updatedBy: params.createdBy ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create brand");
	}
	return row;
}

export async function updateBrand(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: { name?: string; description?: string; updatedBy?: string | null }
): Promise<typeof brands.$inferSelect> {
	const [row] = await tenantDb
		.update(brands)
		.set({
			...(params.name !== undefined && { name: params.name }),
			...(params.description !== undefined && { description: params.description }),
			...(params.updatedBy !== undefined && { updatedBy: params.updatedBy }),
			updatedAt: new Date(),
		})
		.where(eq(brands.id, id))
		.returning();

	if (!row) {
		throw new Error("Brand not found");
	}
	return row;
}

export async function deleteBrand(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<void> {
	await tenantDb.delete(brands).where(eq(brands.id, id));
}
