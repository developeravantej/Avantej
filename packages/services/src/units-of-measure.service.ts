import { eq, asc, ilike } from "drizzle-orm";
import { unitsOfMeasure } from "@avantej-core/db/schema/tenant/units-of-measure";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export async function listUnitsOfMeasure(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { search?: string } = {},
): Promise<(typeof unitsOfMeasure.$inferSelect)[]> {
	const { search } = params;

	if (search) {
		return tenantDb.query.unitsOfMeasure.findMany({
			where: ilike(unitsOfMeasure.name, `%${search}%`),
			orderBy: [asc(unitsOfMeasure.name)],
		});
	}

	return tenantDb.query.unitsOfMeasure.findMany({
		orderBy: [asc(unitsOfMeasure.name)],
	});
}

export async function getUomById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof unitsOfMeasure.$inferSelect | null> {
	const row = await tenantDb.query.unitsOfMeasure.findFirst({
		where: eq(unitsOfMeasure.id, id),
	});
	return row ?? null;
}

export async function createUom(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		name: string;
		description?: string;
		baseUomId?: string;
		conversionFactor?: string;
	},
): Promise<typeof unitsOfMeasure.$inferSelect> {
	const [row] = await tenantDb
		.insert(unitsOfMeasure)
		.values({
			name: params.name,
			description: params.description ?? null,
			baseUomId: params.baseUomId ?? null,
			conversionFactor: params.conversionFactor ?? "1",
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create unit of measure");
	}
	return row;
}

export async function updateUom(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: {
		name?: string;
		description?: string;
		baseUomId?: string;
		conversionFactor?: string;
	},
): Promise<typeof unitsOfMeasure.$inferSelect> {
	const [row] = await tenantDb
		.update(unitsOfMeasure)
		.set({
			...(params.name !== undefined && { name: params.name }),
			...(params.description !== undefined && {
				description: params.description,
			}),
			...(params.baseUomId !== undefined && { baseUomId: params.baseUomId }),
			...(params.conversionFactor !== undefined && {
				conversionFactor: params.conversionFactor,
			}),
			updatedAt: new Date(),
		})
		.where(eq(unitsOfMeasure.id, id))
		.returning();

	if (!row) {
		throw new Error("Unit of measure not found");
	}
	return row;
}

export async function deleteUom(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<void> {
	await tenantDb.delete(unitsOfMeasure).where(eq(unitsOfMeasure.id, id));
}
