/**
 * Commission Pipeline — Origination Plan (Phase 3, PURE)
 *
 * `planOrigination` is the plan stage for origination (sales) commission splits.
 * It is purely a function of its inputs — NO database access, NO side effects,
 * NO console.log/warn/error output.
 *
 * CALL SITE: `calculateOriginationCommission` in commission-calculator.service.ts.
 *
 * ## What is "origination"?
 *
 * Origination commission fires ONCE per sales order at the moment of sale
 * (not per appointment-delivery). The earner is the CLOSER — the staff member
 * who converted the deal (sales_orders.sold_by). An optional LEAD SOURCE earner
 * (sales_orders.lead_source_user_id) gets a separate split when a `lead` track
 * is configured.
 *
 * ## Track shape expected by this planner
 *
 * Each resolved track is an `on_sale` track from `commission_tracks`, carrying:
 *   - basis:       "net_order" | "gross_order" | "flat"
 *   - paymentType: "fixed" | "variable"
 *   - roleType:    CommissionRoleType (determines which beneficiary to use)
 *   - rate:        flat amount (cents, if fixed) or basis-points rate (if variable)
 *
 * ## Basis resolution
 *
 *   net_order   → totalAmount passed by caller (sales_orders.totalAmount — net price)
 *   gross_order → grossOrderAmount passed by caller (summed gross line items)
 *   flat        → rateAmountCents from the track (fixed absolute amount)
 *
 * ## Amount formula (multiply-then-floor, consistent with commission-math.ts)
 *
 *   fixed:    finalCents = rateAmountCents
 *   variable: baseAmountCents = floor(baseAmount × rateBp / 10000)
 *             finalCents = floor(baseAmountCents × 10000 / 10000)
 *             = floor(baseAmount × rateBp / 10000)   [rateBp in basis points]
 *
 * ## GAPS #23 — missing closer audit
 *
 * When no closer is resolved (soldByUserId is null/undefined) and a `sales` track
 * is configured, a SkipReason with reason "no_closer" is emitted. Silent drops
 * are not acceptable — attribution gaps must be surfaced for audit.
 */

import type { PlannedSplit, SkipReason, SkipReasonCode } from "./plan";
import type {
	CommissionRoleType,
	CommissionBasis,
	CommissionPaymentType,
} from "@avantej-core/types";

// Re-export for consumers
export type { PlannedSplit, SkipReason };

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * A resolved on_sale track with its rate, ready for the planner.
 * The caller (calculateOriginationCommission) resolves these from the DB.
 */
export interface ResolvedOriginationTrack {
	trackId: string;
	trackVersionId: string | null;
	roleType: CommissionRoleType;
	basis: CommissionBasis;
	paymentType: CommissionPaymentType;
	/**
	 * For fixed tracks: absolute amount in cents.
	 * For variable tracks: rate in basis points (e.g. 1000 = 10%).
	 */
	rateAmountCentsOrBp: number;
	configId: string; // backing config id for SkipReason context
	configVersionId: string | undefined;
}

export interface PlanOriginationInput {
	salesOrderId: string;
	/**
	 * Resolved on_sale tracks for this order's category/scope.
	 * The caller fetches all is_active on_sale tracks for the org/category
	 * and passes them in. One call to planOrigination covers all of them.
	 */
	tracks: ResolvedOriginationTrack[];
	/**
	 * net_order base: sales_orders.totalAmount (pre-tax, post-discount, post-credit).
	 * This is the resolved net amount — use it directly (OQ6 decision).
	 */
	netOrderAmountCents: number;
	/**
	 * gross_order base: sum of line-item unit prices × quantities before any
	 * promotions/discounts (i.e. original price). Caller computes this.
	 */
	grossOrderAmountCents: number;
	/**
	 * Closer: the staff member who closed the sale.
	 * Maps to sales_orders.sold_by (cross-DB userId).
	 * May be null/undefined — if so and a `sales` track exists, emits no_closer skip.
	 */
	soldByUserId: string | null | undefined;
	/**
	 * Lead source: the staff member who generated the lead.
	 * Maps to sales_orders.lead_source_user_id. Optional.
	 */
	leadSourceUserId: string | null | undefined;
	/**
	 * Pre-fetched member tier IDs for the beneficiaries, keyed by userId.
	 * Required for track-rate lookup when tracks are tier-based.
	 * Can be empty map if tracks use flat rates or basis-points against the order total.
	 */
	memberTierByUserId: Map<string, string | null>;
	actor: { userId: string; memberId: string; role: string };
	earnedAt: Date;
}

export interface OriginationPlan {
	splits: PlannedSplit[];
	skipped: SkipReason[];
}

// ---------------------------------------------------------------------------
// Extended SkipReasonCode for origination-specific reasons
// ---------------------------------------------------------------------------

export type OriginationSkipReasonCode =
	| SkipReasonCode
	| "no_closer"
	| "no_lead_source";

export interface OriginationSkipReason {
	reason: OriginationSkipReasonCode;
	staffId: string | null;
	configId: string;
	salesOrderId: string;
	trackId: string;
}

// ---------------------------------------------------------------------------
// planOrigination — pure, no DB
// ---------------------------------------------------------------------------

export function planOrigination(input: PlanOriginationInput): OriginationPlan {
	const splits: PlannedSplit[] = [];
	const skipped: OriginationSkipReason[] = [];

	if (input.tracks.length === 0) {
		return { splits, skipped: skipped as unknown as SkipReason[] };
	}

	for (const track of input.tracks) {
		// Resolve the beneficiary userId based on the track's roleType
		const beneficiaryUserId = resolveBeneficiary(track.roleType, input);

		if (!beneficiaryUserId) {
			// GAPS #23: emit a skip reason — never silent-drop
			const reason: OriginationSkipReasonCode =
				track.roleType === "sales" ? "no_closer" : "no_lead_source";
			skipped.push({
				reason,
				staffId: null,
				configId: track.configId,
				salesOrderId: input.salesOrderId,
				trackId: track.trackId,
			});
			continue;
		}

		// Resolve base amount
		const baseAmountCents = resolveBase(track, input);
		if (baseAmountCents <= 0) {
			// Zero or negative base — nothing to split (e.g. fully discounted order)
			skipped.push({
				reason: "no_tier_rate" as OriginationSkipReasonCode, // closest semantic
				staffId: beneficiaryUserId,
				configId: track.configId,
				salesOrderId: input.salesOrderId,
				trackId: track.trackId,
			});
			continue;
		}

		// For origination, each track earns the full base — no coach-slot weightage
		// system (single earner per track). Weight = 10000bp (100%).
		const effectiveWeightage = 10_000;
		const finalAmountCents = computeOriginationFinal(
			baseAmountCents,
			track.paymentType,
			effectiveWeightage,
		);

		const splitPercentage =
			track.paymentType === "fixed"
				? 0
				: Math.round(
						(track.rateAmountCentsOrBp * effectiveWeightage) / 1_000_000,
					);

		splits.push({
			staffId: beneficiaryUserId,
			slotIndex: 0, // origination has no coach-slot system; slotIndex 0 is canonical
			weightageBasisPoints: effectiveWeightage,
			baseAmountCents,
			finalAmountCents,
			splitPercentage,
			trainerTierId: input.memberTierByUserId.get(beneficiaryUserId) ?? null,
			conditionId: null,
			configVersionId: track.configVersionId,
		});
	}

	return { splits, skipped: skipped as unknown as SkipReason[] };
}

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

function resolveBeneficiary(
	roleType: CommissionRoleType,
	input: PlanOriginationInput,
): string | null {
	switch (roleType) {
		case "sales":
			return input.soldByUserId ?? null;
		case "marketing":
		case "referrer":
			return input.leadSourceUserId ?? null;
		case "trainer":
			// Trainer tracks fire on_completion — not valid for on_sale origination.
			// Skip silently (misconfigured track).
			return null;
	}
}

function resolveBase(
	track: ResolvedOriginationTrack,
	input: PlanOriginationInput,
): number {
	switch (track.basis) {
		case "net_order":
			if (track.paymentType === "fixed") {
				return track.rateAmountCentsOrBp;
			}
			// variable: rateAmountCentsOrBp is basis points
			return Math.floor(
				(input.netOrderAmountCents * track.rateAmountCentsOrBp) / 10_000,
			);

		case "gross_order":
			if (track.paymentType === "fixed") {
				return track.rateAmountCentsOrBp;
			}
			return Math.floor(
				(input.grossOrderAmountCents * track.rateAmountCentsOrBp) / 10_000,
			);

		case "flat":
			// Flat basis: the rate IS the amount (always treated as cents, regardless of paymentType)
			return track.rateAmountCentsOrBp;

		case "delivery_total":
			// delivery_total is for on_completion tracks — not meaningful for origination.
			// Treat the same as net_order as a safe fallback.
			if (track.paymentType === "fixed") {
				return track.rateAmountCentsOrBp;
			}
			return Math.floor(
				(input.netOrderAmountCents * track.rateAmountCentsOrBp) / 10_000,
			);
	}
}

function computeOriginationFinal(
	baseAmountCents: number,
	paymentType: CommissionPaymentType,
	effectiveWeightage: number,
): number {
	if (paymentType === "fixed") {
		// Fixed: base is already the final amount; weightage 10000 = 100% so no multiplication needed
		return baseAmountCents;
	}
	// variable: base was already computed from basis-points, weightage is 10000 (100%)
	// floor((base × 10000) / 10000) = floor(base) = base (since base is already floored)
	return Math.floor((baseAmountCents * effectiveWeightage) / 10_000);
}
