import { eq, and, asc, sql, ne } from "drizzle-orm";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { members } from "@avantej-core/db/schema/tenant/members";
import { categoryCommissionConfigs } from "@avantej-core/db/schema/tenant/category-commission-configs";
import { commissionTierRates } from "@avantej-core/db/schema/tenant/commission-tier-rates";
import { commissionConditions } from "@avantej-core/db/schema/tenant/commission-conditions";
import { commissionConditionRates } from "@avantej-core/db/schema/tenant/commission-condition-rates";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type MissingRateCategory = {
	categoryId: string;
	configId: string;
};

export type CreateTrainerTierResult = {
	tier: typeof trainerTiers.$inferSelect;
	missingRateCategories: MissingRateCategory[];
};

export type ReactivateTrainerTierResult = {
	tier: typeof trainerTiers.$inferSelect;
	missingRateCategories: MissingRateCategory[];
};

export async function listTrainerTiers(
	tenantDb: TenantDb,
	{ includeInactive = false }: { includeInactive?: boolean },
): Promise<(typeof trainerTiers.$inferSelect)[]> {
	const query = tenantDb
		.select()
		.from(trainerTiers)
		.orderBy(asc(trainerTiers.rank));

	if (!includeInactive) {
		return tenantDb
			.select()
			.from(trainerTiers)
			.where(eq(trainerTiers.isActive, true))
			.orderBy(asc(trainerTiers.rank));
	}

	return query;
}

export async function createTrainerTier(
	tenantDb: TenantDb,
	{
		name,
		description,
		rank = 0,
	}: { name: string; description?: string; rank?: number },
): Promise<CreateTrainerTierResult> {
	const existing = await tenantDb
		.select({ id: trainerTiers.id })
		.from(trainerTiers)
		.where(sql`LOWER(${trainerTiers.name}) = LOWER(${name})`)
		.limit(1);

	if (existing.length > 0) {
		throw new Error("A tier with this name already exists");
	}

	const inserted = await tenantDb
		.insert(trainerTiers)
		.values({ name, description, rank })
		.returning();

	const tier = inserted[0]!;

	const missingRateCategories = await getConfigsMissingRateForTier(tenantDb, tier.id);

	return { tier, missingRateCategories };
}

export async function updateTrainerTier(
	tenantDb: TenantDb,
	id: string,
	{
		name,
		description,
		rank,
		isActive,
	}: { name?: string; description?: string | null; rank?: number; isActive?: boolean },
): Promise<typeof trainerTiers.$inferSelect> {
	if (name !== undefined) {
		const existing = await tenantDb
			.select({ id: trainerTiers.id })
			.from(trainerTiers)
			.where(and(sql`LOWER(${trainerTiers.name}) = LOWER(${name})`, ne(trainerTiers.id, id)))
			.limit(1);

		if (existing.length > 0) {
			throw new Error("A tier with this name already exists");
		}
	}

	const rows = await tenantDb
		.update(trainerTiers)
		.set({
			...(name !== undefined && { name }),
			...(description !== undefined && { description }),
			...(rank !== undefined && { rank }),
			...(isActive !== undefined && { isActive }),
			updatedAt: new Date(),
		})
		.where(eq(trainerTiers.id, id))
		.returning();

	return rows[0]!;
}

export async function deactivateTrainerTier(
	tenantDb: TenantDb,
	id: string,
): Promise<typeof trainerTiers.$inferSelect> {
	const [updated] = await tenantDb
		.update(trainerTiers)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(trainerTiers.id, id))
		.returning();

	if (!updated) {
		throw new Error("Trainer tier not found");
	}

	return updated;
}

export async function reactivateTrainerTier(
	tenantDb: TenantDb,
	id: string,
): Promise<ReactivateTrainerTierResult> {
	const [tier] = await tenantDb
		.update(trainerTiers)
		.set({ isActive: true, updatedAt: new Date() })
		.where(eq(trainerTiers.id, id))
		.returning();

	if (!tier) {
		throw new Error("Trainer tier not found");
	}

	const missingRateCategories = await getConfigsMissingRateForTier(tenantDb, id);

	return { tier, missingRateCategories };
}

export async function assignTierToMember(
	tenantDb: TenantDb,
	memberId: string,
	tierId: string | null,
): Promise<typeof members.$inferSelect> {
	const [member] = await tenantDb
		.select()
		.from(members)
		.where(eq(members.id, memberId))
		.limit(1);

	if (!member) {
		throw new Error("Member not found");
	}

	if (member.role !== "trainer") {
		throw new Error("Only trainers can be assigned a tier");
	}

	if (tierId !== null) {
		const [tier] = await tenantDb
			.select({ id: trainerTiers.id })
			.from(trainerTiers)
			.where(eq(trainerTiers.id, tierId))
			.limit(1);

		if (!tier) {
			throw new Error("Trainer tier not found");
		}
	}

	const updatedRows = await tenantDb
		.update(members)
		.set({ trainerTierId: tierId })
		.where(eq(members.id, memberId))
		.returning();

	return updatedRows[0]!;
}

export async function getConfigsMissingRateForTier(
	tenantDb: TenantDb,
	tierId: string,
): Promise<MissingRateCategory[]> {
	const configs = await tenantDb
		.select({
			id: categoryCommissionConfigs.id,
			categoryId: categoryCommissionConfigs.categoryId,
			isConditional: categoryCommissionConfigs.isConditional,
		})
		.from(categoryCommissionConfigs)
		.where(eq(categoryCommissionConfigs.isActive, true));

	const missing: MissingRateCategory[] = [];

	for (const config of configs) {
		if (!config.isConditional) {
			const rate = await tenantDb
				.select({ id: commissionTierRates.id })
				.from(commissionTierRates)
				.where(
					and(
						eq(commissionTierRates.configId, config.id),
						eq(commissionTierRates.trainerTierId, tierId),
					),
				)
				.limit(1);

			if (rate.length === 0) {
				missing.push({ categoryId: config.categoryId, configId: config.id });
			}
		} else {
			const conditions = await tenantDb
				.select({ id: commissionConditions.id })
				.from(commissionConditions)
				.where(eq(commissionConditions.configId, config.id));

			if (conditions.length === 0) {
				missing.push({ categoryId: config.categoryId, configId: config.id });
				continue;
			}

			const conditionIds = conditions.map((c) => c.id);

			// Check if ANY condition under this config has a rate for this tier.
			// If none do, the tier is missing a rate for this config.
			let hasAnyRate = false;
			for (const conditionId of conditionIds) {
				const rate = await tenantDb
					.select({ id: commissionConditionRates.id })
					.from(commissionConditionRates)
					.where(
						and(
							eq(commissionConditionRates.conditionId, conditionId),
							eq(commissionConditionRates.trainerTierId, tierId),
						),
					)
					.limit(1);

				if (rate.length > 0) {
					hasAnyRate = true;
					break;
				}
			}

			if (!hasAnyRate) {
				missing.push({ categoryId: config.categoryId, configId: config.id });
			}
		}
	}

	return missing;
}
