/**
 * Service Category Service
 *
 * Handles service category CRUD for tenant organizations.
 * Categories are scoped to branches; list respects accessible node IDs.
 *
 * Usage:
 * ```typescript
 * import { listServiceCategories, createServiceCategory } from "@avantej-core/services";
 * const categories = await listServiceCategories(tenantDb, { branchId, isActive: true });
 * ```
 */

import { eq, and, asc } from "drizzle-orm";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListServiceCategoriesParams = {
	branchId?: string | null;
	isActive?: boolean;
	accessibleNodeIds?: string[];
};

export type CreateServiceCategoryParams = {
	name: string;
	description?: string | null;
	displayOrder?: number;
	branchId?: string | null;
	isActive?: boolean;
	schedulingType?: "appointment" | "class_slot";
	createdBy?: string | null;
};

export type UpdateServiceCategoryParams =
	Partial<CreateServiceCategoryParams> & {
		updatedBy?: string | null;
	};

/**
 * List service categories, optionally filtered by branch and active status.
 * When accessibleNodeIds is provided, only categories whose branchId is in that set (or null) are returned.
 */
export async function listServiceCategories(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: ListServiceCategoriesParams = {},
): Promise<(typeof serviceCategories.$inferSelect)[]> {
	const { branchId, isActive, accessibleNodeIds } = params;

	const conditions = [];
	if (branchId !== undefined && branchId !== null) {
		conditions.push(eq(serviceCategories.branchId, branchId));
	}
	if (isActive !== undefined) {
		conditions.push(eq(serviceCategories.isActive, isActive));
	}

	let query = tenantDb.query.serviceCategories.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [
			asc(serviceCategories.displayOrder),
			asc(serviceCategories.createdAt),
		],
	});

	const rows = await query;

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		return rows.filter(
			(row) =>
				row.branchId === null || accessibleNodeIds.includes(row.branchId),
		);
	}

	return rows;
}

/**
 * Get a service category by ID.
 */
export async function getServiceCategoryById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof serviceCategories.$inferSelect | null> {
	const row = await tenantDb.query.serviceCategories.findFirst({
		where: eq(serviceCategories.id, id),
	});
	return row ?? null;
}

/**
 * Create a service category.
 */
export async function createServiceCategory(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateServiceCategoryParams,
): Promise<typeof serviceCategories.$inferSelect> {
	const [row] = await tenantDb
		.insert(serviceCategories)
		.values({
			name: params.name,
			description: params.description ?? null,
			displayOrder: params.displayOrder ?? 0,
			branchId: params.branchId ?? null,
			isActive: params.isActive ?? true,
			schedulingType: params.schedulingType ?? "appointment",
			createdBy: params.createdBy ?? null,
			updatedBy: params.createdBy ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create service category");
	}
	return row;
}

/**
 * Update a service category by ID.
 */
export async function updateServiceCategory(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: UpdateServiceCategoryParams,
): Promise<typeof serviceCategories.$inferSelect> {
	const [row] = await tenantDb
		.update(serviceCategories)
		.set({
			...(params.name !== undefined && { name: params.name }),
			...(params.description !== undefined && {
				description: params.description,
			}),
			...(params.displayOrder !== undefined && {
				displayOrder: params.displayOrder,
			}),
			...(params.branchId !== undefined && { branchId: params.branchId }),
			...(params.isActive !== undefined && { isActive: params.isActive }),
			...(params.schedulingType !== undefined && {
				schedulingType: params.schedulingType,
			}),
			...(params.updatedBy !== undefined && { updatedBy: params.updatedBy }),
			updatedAt: new Date(),
		})
		.where(eq(serviceCategories.id, id))
		.returning();

	if (!row) {
		throw new Error("Service category not found");
	}
	return row;
}
