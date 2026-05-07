import { eq, and, inArray } from "drizzle-orm";
import { memberCategoryBufferOverrides } from "@avantej-core/db/schema/tenant/member-category-buffer-overrides";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { serviceCategoryConfig } from "@avantej-core/db/schema/tenant/service-category-config";
import { serviceMembers } from "@avantej-core/db/schema/tenant/service-members";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type CategoryOverrideRow = {
	categoryId: string;
	categoryName: string;
	orgDefaultBuffer: number;
	bufferTimeMinutes: number | null;
};

/**
 * Returns all categories a member has assigned services in,
 * with org default and their current override (if any).
 */
export async function listCategoryBufferOverridesForMember(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	memberId: string,
): Promise<CategoryOverrideRow[]> {
	const assignedCategories = await tenantDb
		.selectDistinct({
			categoryId: services.categoryId,
			categoryName: serviceCategories.name,
			orgDefaultBuffer: serviceCategoryConfig.bufferTimeMinutes,
		})
		.from(serviceMembers)
		.innerJoin(services, eq(serviceMembers.serviceId, services.id))
		.leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
		.leftJoin(serviceCategoryConfig, eq(services.categoryId, serviceCategoryConfig.categoryId))
		.where(eq(serviceMembers.memberId, memberId));

	const categoryIds = assignedCategories
		.map((r) => r.categoryId)
		.filter((id): id is string => !!id);

	if (categoryIds.length === 0) return [];

	const overrides = await tenantDb
		.select()
		.from(memberCategoryBufferOverrides)
		.where(
			and(
				eq(memberCategoryBufferOverrides.memberId, memberId),
				inArray(memberCategoryBufferOverrides.categoryId, categoryIds),
			),
		);

	const overrideMap = new Map(overrides.map((o) => [o.categoryId, o.bufferTimeMinutes]));

	return assignedCategories
		.filter((r) => !!r.categoryId)
		.map((r) => ({
			categoryId: r.categoryId!,
			categoryName: r.categoryName ?? "(unnamed)",
			orgDefaultBuffer: r.orgDefaultBuffer ?? 0,
			bufferTimeMinutes: overrideMap.get(r.categoryId!) ?? null,
		}));
}

/**
 * Upsert or delete a category-level buffer override for a member.
 * bufferTimeMinutes: null → delete override.
 */
export async function upsertCategoryBufferOverride(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	memberId: string,
	categoryId: string,
	bufferTimeMinutes: number | null,
): Promise<{ categoryId: string; bufferTimeMinutes: number | null }> {
	if (bufferTimeMinutes === null) {
		await tenantDb
			.delete(memberCategoryBufferOverrides)
			.where(
				and(
					eq(memberCategoryBufferOverrides.memberId, memberId),
					eq(memberCategoryBufferOverrides.categoryId, categoryId),
				),
			);
		return { categoryId, bufferTimeMinutes: null };
	}

	const [result] = await tenantDb
		.insert(memberCategoryBufferOverrides)
		.values({ memberId, categoryId, bufferTimeMinutes, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [memberCategoryBufferOverrides.memberId, memberCategoryBufferOverrides.categoryId],
			set: { bufferTimeMinutes, updatedAt: new Date() },
		})
		.returning();

	if (!result) {
		throw new Error("upsertCategoryBufferOverride: INSERT returned no rows unexpectedly");
	}
	return { categoryId, bufferTimeMinutes: result.bufferTimeMinutes };
}
