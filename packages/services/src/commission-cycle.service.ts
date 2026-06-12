/**
 * Commission Cycle Resolver (S-cycle-window-alignment)
 *
 * Resolves the cap-window bounds used by `applyCommissionCaps` when enforcing
 * `category_commission_configs.maxPerCycleCents`.
 *
 * Lookup order:
 *   1. branch-specific row in `commission_cycle_configs` (branchId = X)
 *   2. tenant-wide row (branchId IS NULL)
 *   3. default — UTC calendar month (preserves legacy behavior)
 *
 * Pure functions are kept exported so unit tests can exercise the policy
 * arithmetic without hitting a DB.
 */

import { eq, isNull, or, sql } from "drizzle-orm";
import { commissionCycleConfigs } from "@avantej-core/db/schema/tenant/commission-cycle-configs";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CycleType =
	| "calendar_month"
	| "monthly_anchored"
	| "semi_monthly"
	| "weekly";

export interface CyclePolicy {
	cycleType: CycleType;
	anchorDay: number | null;
}

export interface CycleBounds {
	start: Date;
	end: Date;
}

export const DEFAULT_POLICY: CyclePolicy = {
	cycleType: "calendar_month",
	anchorDay: null,
};

/**
 * Resolve the active cycle policy for a (branch | tenant) target.
 *
 * Single SELECT — no N+1. ORDER BY prefers the branch-specific row when both
 * exist (`branch_id IS NULL` sorts last when ASC + `NULLS LAST` semantics on
 * Postgres; we coerce explicitly for portability).
 */
export async function resolveCyclePolicy(
	db: TenantDb,
	branchId: string | null,
): Promise<CyclePolicy> {
	const rows = await db
		.select({
			cycleType: commissionCycleConfigs.cycleType,
			anchorDay: commissionCycleConfigs.anchorDay,
			branchId: commissionCycleConfigs.branchId,
		})
		.from(commissionCycleConfigs)
		.where(
			branchId
				? or(
						eq(commissionCycleConfigs.branchId, branchId),
						isNull(commissionCycleConfigs.branchId),
					)
				: isNull(commissionCycleConfigs.branchId),
		)
		// Prefer branch-specific (branch_id NOT NULL) over tenant-wide (NULL).
		.orderBy(sql`${commissionCycleConfigs.branchId} IS NULL`)
		.limit(1);

	const row = rows[0];
	if (!row) return DEFAULT_POLICY;
	return {
		cycleType: row.cycleType as CycleType,
		anchorDay: row.anchorDay,
	};
}

/**
 * Pure: derive `[start, end)` from a resolved policy + the date the split was earned.
 *
 * - calendar_month     → 1st-of-month UTC → 1st-of-next-month UTC.
 * - monthly_anchored   → anchorDay-of-current-anchor-month → anchorDay-of-next-month.
 *   If the earnedAt day is before the anchor, the cycle started in the previous calendar month.
 * - semi_monthly       → first half: anchor → anchor+14d; second half: anchor+15d → next anchor.
 * - weekly             → start = midnight UTC of the most-recent occurrence of anchor weekday
 *                        (0=Sun..6=Sat); end = start + 7 days.
 *
 * All math is UTC-based. Anchor day is treated as "the day-of-month or weekday in
 * the timezone the operator configured" — at this layer we assume UTC; future work
 * could plumb a tenant timezone if needed.
 */
export function deriveCycleBounds(
	policy: CyclePolicy,
	earnedAt: Date,
): CycleBounds {
	const d = earnedAt;
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	const dom = d.getUTCDate();

	switch (policy.cycleType) {
		case "calendar_month": {
			const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
			const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
			return { start, end };
		}
		case "monthly_anchored": {
			const anchor = policy.anchorDay ?? 1;
			// If earnedAt is at or after the anchor day, the cycle starts this month.
			// Otherwise it started in the previous month.
			if (dom >= anchor) {
				const start = new Date(Date.UTC(y, m, anchor, 0, 0, 0, 0));
				const end = new Date(Date.UTC(y, m + 1, anchor, 0, 0, 0, 0));
				return { start, end };
			}
			const start = new Date(Date.UTC(y, m - 1, anchor, 0, 0, 0, 0));
			const end = new Date(Date.UTC(y, m, anchor, 0, 0, 0, 0));
			return { start, end };
		}
		case "semi_monthly": {
			const anchor = policy.anchorDay ?? 1;
			const secondHalfStart = anchor + 15;
			if (dom >= secondHalfStart) {
				const start = new Date(Date.UTC(y, m, secondHalfStart, 0, 0, 0, 0));
				const end = new Date(Date.UTC(y, m + 1, anchor, 0, 0, 0, 0));
				return { start, end };
			}
			if (dom >= anchor) {
				const start = new Date(Date.UTC(y, m, anchor, 0, 0, 0, 0));
				const end = new Date(Date.UTC(y, m, secondHalfStart, 0, 0, 0, 0));
				return { start, end };
			}
			// Before first anchor of the month → tail end of the prior month's second half.
			const start = new Date(Date.UTC(y, m - 1, secondHalfStart, 0, 0, 0, 0));
			const end = new Date(Date.UTC(y, m, anchor, 0, 0, 0, 0));
			return { start, end };
		}
		case "weekly": {
			const anchor = policy.anchorDay ?? 1; // default Monday
			const dow = d.getUTCDay();
			const daysBack = (dow - anchor + 7) % 7;
			const startMs = Date.UTC(y, m, dom - daysBack, 0, 0, 0, 0);
			const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
			return { start: new Date(startMs), end: new Date(endMs) };
		}
	}
}

/**
 * Convenience: resolve policy + derive bounds in one shot.
 *
 * Intended for `applyCommissionCaps`. Caller passes `branchId` if it has one
 * (e.g. resolved from the appointment / sales-order parent); otherwise null
 * for tenant-wide policy.
 */
export async function resolveCycleBoundsForDate(
	db: TenantDb,
	branchId: string | null,
	earnedAt: Date,
): Promise<CycleBounds> {
	const policy = await resolveCyclePolicy(db, branchId);
	return deriveCycleBounds(policy, earnedAt);
}
