/**
 * Commission Incentive Service (UAT §12 — incentive thresholds)
 *
 * Rules CRUD + an idempotent period sweep that awards a bonus to each staff
 * whose qualifying confirmed-sales volume crosses a rule's threshold in the
 * period. The sweep is exactly-once: awards are inserted ON CONFLICT DO NOTHING
 * against UNIQUE(incentive_id, staff_id, period_key), so a re-run (cron retry,
 * manual re-trigger) never double-pays.
 *
 * Qualifying volume = SUM(sales_orders.total_amount) for orders the staff closed
 * (sold_by = members.userId) that are confirmed/completed within the period.
 *
 * v1 SCOPE NOTE: the awards ledger (commission_incentive_awards) is STANDALONE —
 * a period-aggregate bonus is structurally unlike a per-order commission_split,
 * so awards are intentionally NOT written into commission_splits and do NOT yet
 * flow through the payout batches or getCommissionByTier reporting. Integrating
 * awards into the payout pipeline is a deliberate follow-up (see _future/), not
 * an oversight.
 */

import { and, eq, gte, inArray, isNull, lte, or, sum } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	commissionIncentives,
	commissionIncentiveAwards,
} from "@avantej-core/db/schema/tenant/commission-incentives";
import { members } from "@avantej-core/db/schema/tenant/members";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";
type IncentiveBonusType = "fixed" | "pct";

export type IncentiveRuleRow = typeof commissionIncentives.$inferSelect;
export type IncentiveAwardRow = typeof commissionIncentiveAwards.$inferSelect;

export interface CreateIncentiveInput {
	name: string;
	roleType: CommissionRoleType;
	/** Optional tier restriction; null = all tiers of the role. */
	trainerTierId?: string | null;
	thresholdCents: number;
	bonusType: IncentiveBonusType;
	/** Cents (fixed) or basis points (pct, e.g. 500 = 5%). */
	bonusValue: number;
}

/**
 * Compute the bonus a staff earns under a rule, or null if below threshold.
 * Pure — exported for unit testing.
 */
export function computeIncentiveBonusCents(
	volumeCents: number,
	thresholdCents: number,
	bonusType: IncentiveBonusType,
	bonusValue: number,
): number | null {
	if (volumeCents < thresholdCents) return null;
	if (bonusType === "fixed") return Math.max(0, bonusValue);
	// pct: bonusValue is basis points of the qualifying volume.
	return Math.max(0, Math.floor((volumeCents * bonusValue) / 10000));
}

/**
 * Monthly period key "YYYY-MM" from a date (UTC). Part of the award idempotency
 * key so each rule pays at most once per staff per month.
 */
export function monthlyPeriodKey(d: Date): string {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

// ── Rules CRUD ────────────────────────────────────────────────────────────────

export async function createIncentive(
	tenantDb: TenantDb,
	input: CreateIncentiveInput,
): Promise<IncentiveRuleRow> {
	const [row] = await tenantDb
		.insert(commissionIncentives)
		.values({
			name: input.name,
			roleType: input.roleType,
			trainerTierId: input.trainerTierId ?? null,
			thresholdCents: input.thresholdCents,
			bonusType: input.bonusType,
			bonusValue: input.bonusValue,
		})
		.returning();
	if (!row) throw new Error("createIncentive: insert returned no row");
	return row;
}

export async function listIncentives(
	tenantDb: TenantDb,
	opts: { activeOnly?: boolean } = {},
): Promise<IncentiveRuleRow[]> {
	if (opts.activeOnly) {
		return tenantDb
			.select()
			.from(commissionIncentives)
			.where(eq(commissionIncentives.isActive, true));
	}
	return tenantDb.select().from(commissionIncentives);
}

export async function deactivateIncentive(
	tenantDb: TenantDb,
	id: string,
): Promise<void> {
	await tenantDb
		.update(commissionIncentives)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(commissionIncentives.id, id));
}

export async function listIncentiveAwards(
	tenantDb: TenantDb,
	opts: { periodKey?: string; staffId?: string } = {},
): Promise<IncentiveAwardRow[]> {
	const conditions = [];
	if (opts.periodKey)
		conditions.push(eq(commissionIncentiveAwards.periodKey, opts.periodKey));
	if (opts.staffId)
		conditions.push(eq(commissionIncentiveAwards.staffId, opts.staffId));
	const q = tenantDb.select().from(commissionIncentiveAwards);
	return conditions.length > 0 ? q.where(and(...conditions)) : q;
}

// ── Period sweep ──────────────────────────────────────────────────────────────

export interface EvaluateIncentivesParams {
	/** Inclusive period start (UTC). */
	periodStart: Date;
	/** Inclusive period end (UTC). */
	periodEnd: Date;
	/** Idempotency bucket; defaults to the monthly key of periodStart. */
	periodKey?: string;
}

export interface EvaluateIncentivesResult {
	periodKey: string;
	rulesEvaluated: number;
	awardsCreated: number;
}

/**
 * Evaluate every active incentive rule for the period and award bonuses to
 * qualifying staff. Idempotent: re-running for the same period inserts nothing
 * new (ON CONFLICT DO NOTHING on the unique award key).
 */
export async function evaluateIncentivesForPeriod(
	tenantDb: TenantDb,
	params: EvaluateIncentivesParams,
): Promise<EvaluateIncentivesResult> {
	const periodKey = params.periodKey ?? monthlyPeriodKey(params.periodStart);

	const rules = await listIncentives(tenantDb, { activeOnly: true });
	let awardsCreated = 0;

	for (const rule of rules) {
		// Eligible staff for this rule. LEFT JOIN (not inner) so tier-less members
		// are not silently excluded — the qualifying-volume threshold below is the
		// real gate, so a closer who never sold simply earns 0 and drops out.
		// - rule.trainerTierId set  → exactly that tier.
		// - otherwise (all-tiers)   → members whose tier has the matching roleType,
		//   PLUS tier-less members (they have no commission role to match on, but a
		//   tier-less sales closer with volume must still be able to qualify).
		const eligible = await tenantDb
			.select({ userId: members.userId })
			.from(members)
			.leftJoin(trainerTiers, eq(members.trainerTierId, trainerTiers.id))
			.where(
				rule.trainerTierId
					? eq(members.trainerTierId, rule.trainerTierId)
					: or(
							eq(trainerTiers.roleType, rule.roleType as CommissionRoleType),
							isNull(members.trainerTierId),
						),
			);

		const staffIds = [...new Set(eligible.map((e) => e.userId))];
		if (staffIds.length === 0) continue;

		for (const staffId of staffIds) {
			// Qualifying volume = confirmed/completed sales this staff closed in the period.
			const [vol] = await tenantDb
				.select({ total: sum(salesOrders.totalAmount) })
				.from(salesOrders)
				.where(
					and(
						eq(salesOrders.soldBy, staffId),
						inArray(salesOrders.status, ["confirmed", "completed"]),
						gte(salesOrders.date, params.periodStart),
						lte(salesOrders.date, params.periodEnd),
					),
				);
			const volumeCents = vol?.total ? parseInt(String(vol.total), 10) : 0;

			const bonusCents = computeIncentiveBonusCents(
				volumeCents,
				rule.thresholdCents,
				rule.bonusType as IncentiveBonusType,
				rule.bonusValue,
			);
			if (bonusCents === null) continue;

			// Idempotent award: at most one per (rule, staff, period).
			const inserted = await tenantDb
				.insert(commissionIncentiveAwards)
				.values({
					incentiveId: rule.id,
					staffId,
					periodKey,
					qualifyingTotalCents: volumeCents,
					thresholdCents: rule.thresholdCents,
					bonusCents,
				})
				.onConflictDoNothing()
				.returning({ id: commissionIncentiveAwards.id });
			if (inserted.length > 0) awardsCreated += 1;
		}
	}

	return { periodKey, rulesEvaluated: rules.length, awardsCreated };
}
