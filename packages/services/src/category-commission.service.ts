import { eq, asc } from "drizzle-orm";
import { categoryCommissionConfigs } from "@avantej-core/db/schema/tenant/category-commission-configs";
import { commissionCoachSlots } from "@avantej-core/db/schema/tenant/commission-coach-slots";
import { commissionTierRates } from "@avantej-core/db/schema/tenant/commission-tier-rates";
import { commissionConditions } from "@avantej-core/db/schema/tenant/commission-conditions";
import { commissionConditionRates } from "@avantej-core/db/schema/tenant/commission-condition-rates";
import { writeAudit } from "./audit-log.service";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type getCategoryCommissionConfigResult = {
	config: typeof categoryCommissionConfigs.$inferSelect;
	slots: (typeof commissionCoachSlots.$inferSelect)[];
	rates?: (typeof commissionTierRates.$inferSelect)[];
	conditions?: Array<{
		condition: typeof commissionConditions.$inferSelect;
		rates: (typeof commissionConditionRates.$inferSelect)[];
	}>;
} | null;

export async function getCategoryCommissionConfig(
	tenantDb: TenantDb,
	categoryId: string,
): Promise<getCategoryCommissionConfigResult> {
	const [config] = await tenantDb
		.select()
		.from(categoryCommissionConfigs)
		.where(eq(categoryCommissionConfigs.categoryId, categoryId));

	if (!config) return null;

	const slots = await tenantDb
		.select()
		.from(commissionCoachSlots)
		.where(eq(commissionCoachSlots.configId, config.id))
		.orderBy(asc(commissionCoachSlots.slotIndex));

	if (!config.isConditional) {
		const rates = await tenantDb
			.select()
			.from(commissionTierRates)
			.where(eq(commissionTierRates.configId, config.id));

		return { config, slots, rates };
	}

	const conditionRows = await tenantDb
		.select()
		.from(commissionConditions)
		.where(eq(commissionConditions.configId, config.id))
		.orderBy(asc(commissionConditions.conditionIndex));

	const conditions = await Promise.all(
		conditionRows.map(async (condition) => {
			const rates = await tenantDb
				.select()
				.from(commissionConditionRates)
				.where(eq(commissionConditionRates.conditionId, condition.id));
			return { condition, rates };
		}),
	);

	return { config, slots, conditions };
}

export interface UpsertCategoryCommissionConfigInput {
	categoryId: string;
	paymentType: "fixed" | "variable";
	isConditional: boolean;
	maxCoaches: number;
	slots: Array<{
		slotIndex: number;
		label: string;
		weightageBasisPoints: number;
	}>;
	rates?: Array<{ trainerTierId: string; amount: number }>;
	conditions?: Array<{
		conditionIndex: number;
		operator: "lt" | "lte" | "gt" | "gte" | "eq" | "between";
		threshold: number;
		thresholdMax?: number;
		label?: string;
		rates: Array<{ trainerTierId: string; amount: number }>;
	}>;
}

/**
 * Map a condition operator + threshold(s) to a half-open attendee-count
 * interval [start, end) so overlaps can be detected by simple comparison.
 * Exported for unit testing — the boundary math here decides whether two
 * conditions silently cover the same attendee count. Pure.
 */
export function toHalfOpen(
	operator: string,
	threshold: number,
	thresholdMax?: number,
): [number, number] {
	switch (operator) {
		case "lt":
			return [0, threshold];
		case "lte":
			return [0, threshold + 1];
		case "gt":
			return [threshold + 1, Number.POSITIVE_INFINITY];
		case "gte":
			return [threshold, Number.POSITIVE_INFINITY];
		case "eq":
			return [threshold, threshold + 1];
		case "between":
			return [threshold, (thresholdMax ?? threshold) + 1];
		default:
			return [threshold, threshold + 1];
	}
}

/** True when two half-open intervals [a,b) and [c,d) share any point. Pure. */
export function intervalsOverlap(
	[a, b]: [number, number],
	[c, d]: [number, number],
): boolean {
	return a < d && c < b;
}

export async function upsertCategoryCommissionConfig(
	tenantDb: TenantDb,
	input: UpsertCategoryCommissionConfigInput,
	_actor: { userId?: string; id?: string; role?: string },
): Promise<getCategoryCommissionConfigResult> {
	const slotSum = input.slots.reduce(
		(sum, s) => sum + s.weightageBasisPoints,
		0,
	);
	if (slotSum !== 10000) {
		throw new Error(
			`Slot weightages must sum to 10000 (100%). Current sum: ${slotSum}`,
		);
	}

	if (input.isConditional) {
		if (!input.conditions || input.conditions.length === 0) {
			throw new Error("Conditional config requires at least one condition");
		}

		const intervals = input.conditions.map((c) =>
			toHalfOpen(c.operator, c.threshold, c.thresholdMax),
		);

		for (let i = 0; i < intervals.length; i++) {
			for (let j = i + 1; j < intervals.length; j++) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				if (intervalsOverlap(intervals[i]!, intervals[j]!)) {
					const condA = input.conditions[i]!;
					const condB = input.conditions[j]!;
					throw new Error(
						`Conditions overlap: "${condA.label ?? condA.conditionIndex}" and "${condB.label ?? condB.conditionIndex}" both cover the same attendee count range`,
					);
				}
			}
		}
	} else {
		if (!input.rates || input.rates.length === 0) {
			throw new Error("Non-conditional config requires rates");
		}
	}

	return tenantDb.transaction(async (tx) => {
		await tx
			.delete(categoryCommissionConfigs)
			.where(eq(categoryCommissionConfigs.categoryId, input.categoryId));

		const [config] = await tx
			.insert(categoryCommissionConfigs)
			.values({
				categoryId: input.categoryId,
				paymentType: input.paymentType,
				isConditional: input.isConditional,
				maxCoaches: input.maxCoaches,
			})
			.returning();

		if (!config)
			throw new Error("upsertCategoryCommissionConfig: insert returned no row");

		if (input.slots.length > 0) {
			await tx.insert(commissionCoachSlots).values(
				input.slots.map((s) => ({
					configId: config.id,
					slotIndex: s.slotIndex,
					label: s.label,
					weightageBasisPoints: s.weightageBasisPoints,
				})),
			);
		}

		if (!input.isConditional && input.rates && input.rates.length > 0) {
			await tx.insert(commissionTierRates).values(
				input.rates.map((r) => ({
					configId: config.id,
					trainerTierId: r.trainerTierId,
					amount: r.amount,
				})),
			);
		}

		if (
			input.isConditional &&
			input.conditions &&
			input.conditions.length > 0
		) {
			for (const cond of input.conditions) {
				const [condRow] = await tx
					.insert(commissionConditions)
					.values({
						configId: config.id,
						conditionIndex: cond.conditionIndex,
						operator: cond.operator,
						threshold: cond.threshold,
						thresholdMax: cond.thresholdMax ?? null,
						label: cond.label ?? null,
					})
					.returning();

				if (!condRow)
					throw new Error(
						"upsertCategoryCommissionConfig: condition insert returned no row",
					);

				if (cond.rates.length > 0) {
					await tx.insert(commissionConditionRates).values(
						cond.rates.map((r) => ({
							conditionId: condRow.id,
							trainerTierId: r.trainerTierId,
							amount: r.amount,
						})),
					);
				}
			}
		}

		const result = await getCategoryCommissionConfig(
			tx as unknown as TenantDb,
			input.categoryId,
		);

		// F-COM-D: write audit log for commission config changes
		await writeAudit(tx, {
			actorUserId: _actor.userId ?? "",
			actorMemberId: _actor.id,
			actorRole: _actor.role,
			action: "category_commission.upsert",
			entityType: "category_commission",
			entityId: config?.id,
			summary: `Category commission upserted for category ${input.categoryId}`,
			changes: {
				categoryId: input.categoryId,
				paymentType: input.paymentType,
				isConditional: input.isConditional,
				maxCoaches: input.maxCoaches,
				slotCount: input.slots.length,
				rateCount: input.rates?.length ?? 0,
				conditionCount: input.conditions?.length ?? 0,
			},
		});

		return result;
	});
}

export async function deleteCategoryCommissionConfig(
	tenantDb: TenantDb,
	categoryId: string,
	_actor?: { userId?: string; id?: string; role?: string },
): Promise<{ deleted: true }> {
	return tenantDb.transaction(async (tx) => {
		const deleted = await tx
			.delete(categoryCommissionConfigs)
			.where(eq(categoryCommissionConfigs.categoryId, categoryId))
			.returning();

		if (deleted.length === 0) {
			throw new Error("No commission config found for this category");
		}

		// F-COM-D: write audit log so delete is traceable
		if (_actor) {
			await writeAudit(tx, {
				actorUserId: _actor.userId ?? "",
				actorMemberId: _actor.id,
				actorRole: _actor.role,
				action: "category_commission.delete",
				entityType: "category_commission",
				entityId: deleted[0]?.id,
				summary: `Category commission config deleted for category ${categoryId}`,
				changes: { categoryId, deletedConfigId: deleted[0]?.id },
			});
		}

		return { deleted: true };
	});
}
