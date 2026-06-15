/**
 * Commission Pipeline — Stage 2: Plan (PURE)
 *
 * `planSplits` takes a CommissionContext (loaded by gather stage) plus a
 * PlanInput (caller-supplied parameters) and returns a deterministic list of
 * PlannedSplits (to insert) and SkipReasons (for batch audit).
 *
 * NO database access. NO side effects. NO console output.
 * All math delegates to commission-math.ts verbatim.
 */

import {
	type StaffAssignment,
	type SlotConfig,
	assertConfigSumIs10000,
	dedupeBySlotIndex,
	computeEffectiveWeightages,
	computeFinalAmountCents,
} from "../commission-math";
import type { CommissionContext } from "./context";
import type { CommissionEarnReason } from "@avantej-core/types";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type { StaffAssignment, SlotConfig };

export interface PlanInput {
	/**
	 * matchMode determines which kind of condition-matching was used in the
	 * gather stage. Preserved here so persist can route audit messages correctly.
	 * "operator" = appointment path, "threshold" = POS path.
	 */
	matchMode: "operator" | "threshold";
	quantity: number;
	/** matchValue was used during gather (attendeeCount for operator, qty for threshold). */
	matchValue: number;
	/** When true, staff must be role=trainer with a trainerTierId. */
	requireTrainerRole: boolean;
	staffAssignments: StaffAssignment[];
	unitPriceCents: number;
	appointmentId: string | undefined;
	salesOrderId: string | undefined;
	actor: { userId: string; memberId: string; role: string };
	earnedAt: Date;
	earnReason: CommissionEarnReason;
}

export type SkipReasonCode =
	| "no_coach_slot"
	| "member_not_found"
	| "role_mismatch"
	| "no_tier"
	| "no_tier_rate"
	| "no_condition_rate";

export interface SkipReason {
	reason: SkipReasonCode;
	staffId: string;
	slotIndex?: number;
	trainerTierId?: string | null;
	configId: string;
	conditionId?: string | null;
	appointmentId?: string;
	salesOrderId?: string;
}

export interface PlannedSplit {
	staffId: string;
	slotIndex: number;
	/** Effective weightage in basis points (after redistribution). */
	weightageBasisPoints: number;
	/** Base amount before weightage/quantity (fixed=rate, variable=floor(price*rateBp/10000)). */
	baseAmountCents: number;
	/** Final computed amount (after weightage + quantity + single floor). */
	finalAmountCents: number;
	/** Split percentage for display (0 for fixed, rate*weightage/1_000_000 for variable). */
	splitPercentage: number;
	/** Trainer tier ID used for rate lookup. null when requireTrainerRole=false and member has no tier. */
	trainerTierId: string | null;
	/** Condition ID when config is conditional. */
	conditionId: string | null;
	/** Config version ID for cap JOIN (F-COM-B fix). */
	configVersionId: string | undefined;
}

export interface SplitPlan {
	planned: PlannedSplit[];
	skipped: SkipReason[];
}

// ---------------------------------------------------------------------------
// planSplits — pure, no DB
// ---------------------------------------------------------------------------

export function planSplits(
	context: CommissionContext,
	input: PlanInput,
): SplitPlan {
	const planned: PlannedSplit[] = [];
	const skipped: SkipReason[] = [];

	const {
		config,
		rateTable,
		allSlots,
		memberByUserId,
		resolvedConfigVersionId,
	} = context;

	if (input.staffAssignments.length === 0) {
		return { planned, skipped };
	}

	// Pre-step A1: assert configured slots sum to exactly 10000 bp
	assertConfigSumIs10000(allSlots, config.id);

	// Pre-step B: dedupe assignments by slotIndex
	const { deduped: dedupedAssignments } = dedupeBySlotIndex(
		input.staffAssignments,
	);

	// Build slotWeight map for presence check
	const slotWeightByIndex = new Map<number, number>(
		allSlots.map((s: SlotConfig) => [s.slotIndex, s.weightageBasisPoints]),
	);

	// Filter to assignments that have a configured slot
	const validAssignments = dedupedAssignments
		.filter((a) => {
			if (!slotWeightByIndex.has(a.slotIndex)) {
				skipped.push({
					reason: "no_coach_slot",
					staffId: a.staffId,
					slotIndex: a.slotIndex,
					configId: config.id,
					appointmentId: input.appointmentId,
					salesOrderId: input.salesOrderId,
				});
				return false;
			}
			return true;
		})
		.sort((a, b) => a.slotIndex - b.slotIndex);

	if (validAssignments.length === 0) {
		return { planned, skipped };
	}

	// Pre-step B3: eligibility filter for appointment path (requireTrainerRole=true)
	// For POS path, all validAssignments are eligible — member fetch happens in persist.
	const eligibleAssignments: typeof validAssignments = [];

	if (input.requireTrainerRole) {
		for (const a of validAssignments) {
			const m = memberByUserId.get(a.staffId);
			if (!m) {
				skipped.push({
					reason: "member_not_found",
					staffId: a.staffId,
					configId: config.id,
					appointmentId: input.appointmentId,
					salesOrderId: input.salesOrderId,
				});
				continue;
			}
			if (m.role !== "trainer") {
				skipped.push({
					reason: "role_mismatch",
					staffId: a.staffId,
					configId: config.id,
					appointmentId: input.appointmentId,
					salesOrderId: input.salesOrderId,
				});
				continue;
			}
			if (!m.trainerTierId) {
				skipped.push({
					reason: "no_tier",
					staffId: a.staffId,
					configId: config.id,
					appointmentId: input.appointmentId,
					salesOrderId: input.salesOrderId,
				});
				continue;
			}
			eligibleAssignments.push(a);
		}
	} else {
		// POS path — all valid slot assignments are eligible at plan time.
		// Rate + tier validation happens in persist when individual member is fetched.
		eligibleAssignments.push(...validAssignments);
	}

	if (eligibleAssignments.length === 0) {
		return { planned, skipped };
	}

	// Pre-step C+D: compute effective weightages (redistribution)
	const effectiveWeightages = computeEffectiveWeightages(
		allSlots,
		eligibleAssignments,
	);

	// Per-staff planning
	for (let i = 0; i < eligibleAssignments.length; i++) {
		const assignment = eligibleAssignments[i];
		if (!assignment) continue;
		const effectiveWeightage = effectiveWeightages[i] ?? 0;

		// Resolve trainerTierId from pre-fetched map (appointment path)
		// POS path: trainerTierId not available at plan time — set to null sentinel,
		// persist stage resolves it per-staff after individual member fetch.
		const memberFromMap = memberByUserId.get(assignment.staffId);
		const trainerTierId: string | null = memberFromMap?.trainerTierId ?? null;

		// Rate lookup (appointment path) — for POS path, rate lookup also deferred to persist
		// since trainerTierId is unknown at plan time.
		if (input.requireTrainerRole) {
			// Appointment path: trainerTierId is known, look up rate now
			const rateResolved = resolveRate(
				rateTable,
				trainerTierId,
				config.id,
				assignment.staffId,
				skipped,
				input,
			);
			if (rateResolved === null) continue;

			const baseAmountCents = computeBase(
				rateResolved.rateAmount,
				config.paymentType,
				input.unitPriceCents,
			);
			const finalAmountCents = computeFinalAmountCents(
				baseAmountCents,
				effectiveWeightage,
				input.quantity,
			);
			const splitPercentage = computeSplitPct(
				rateResolved.rateAmount,
				effectiveWeightage,
				config.paymentType,
			);
			const conditionId = rateTable.isConditional
				? rateTable.matchedConditionId
				: null;

			planned.push({
				staffId: assignment.staffId,
				slotIndex: assignment.slotIndex,
				weightageBasisPoints: effectiveWeightage,
				baseAmountCents,
				finalAmountCents,
				splitPercentage,
				trainerTierId,
				conditionId,
				configVersionId: resolvedConfigVersionId,
			});
		} else {
			// POS path: we can't resolve the rate at plan time because we don't
			// have the member's trainerTierId yet (individual fetch in persist).
			// Emit a "deferred" planned split with sentinel amounts; persist
			// will re-resolve rate and recompute amounts.
			// To keep plan.ts truly pure (no DB), we defer POS per-staff rate
			// resolution entirely to persist.ts. We still emit one entry per
			// eligible assignment so persist knows which staff to process and
			// in what effective-weightage order.
			planned.push({
				staffId: assignment.staffId,
				slotIndex: assignment.slotIndex,
				weightageBasisPoints: effectiveWeightage,
				baseAmountCents: 0, // sentinel — resolved in persist
				finalAmountCents: 0, // sentinel — resolved in persist
				splitPercentage: 0, // sentinel — resolved in persist
				trainerTierId: null, // sentinel — resolved in persist
				conditionId: rateTable.isConditional
					? rateTable.matchedConditionId
					: null,
				configVersionId: resolvedConfigVersionId,
			});
		}
	}

	return { planned, skipped };
}

// ---------------------------------------------------------------------------
// Pure helpers (internal to plan.ts)
// ---------------------------------------------------------------------------

function resolveRate(
	rateTable: CommissionContext["rateTable"],
	trainerTierId: string | null,
	configId: string,
	staffId: string,
	skipped: SkipReason[],
	input: Pick<PlanInput, "appointmentId" | "salesOrderId">,
): { rateAmount: number } | null {
	if (!rateTable.isConditional) {
		const tierRate = rateTable.tierRates.find(
			(r) => r.trainerTierId === trainerTierId,
		);
		if (!tierRate) {
			skipped.push({
				reason: "no_tier_rate",
				staffId,
				trainerTierId,
				configId,
				appointmentId: input.appointmentId,
				salesOrderId: input.salesOrderId,
			});
			return null;
		}
		return { rateAmount: tierRate.amount };
	}

	const conditionRate = rateTable.conditionRates.find(
		(r) => r.trainerTierId === trainerTierId,
	);
	if (!conditionRate) {
		skipped.push({
			reason: "no_condition_rate",
			staffId,
			trainerTierId,
			configId,
			conditionId: rateTable.matchedConditionId,
			appointmentId: input.appointmentId,
			salesOrderId: input.salesOrderId,
		});
		return null;
	}
	return { rateAmount: conditionRate.amount };
}

function computeBase(
	rateAmount: number,
	paymentType: string,
	unitPriceCents: number,
): number {
	if (paymentType === "fixed") {
		return rateAmount; // already cents
	}
	// variable: rateAmount is basis points
	return Math.floor((unitPriceCents * rateAmount) / 10000);
}

function computeSplitPct(
	rateAmount: number,
	effectiveWeightage: number,
	paymentType: string,
): number {
	if (paymentType === "fixed") return 0;
	return Math.round((rateAmount * effectiveWeightage) / 1_000_000);
}
