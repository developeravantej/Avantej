/**
 * Fixture factories for commission pipeline types.
 *
 * Usage:
 *   import { makeCommissionContext, makePlanInput, makeMemberSnapshot } from "./commission-fixtures.factory";
 *
 * All factories have sensible defaults and accept partial overrides so callers
 * only specify the fields relevant to their test.
 */

import type {
	CommissionContext,
	MemberSnapshot,
	RateTable,
	ConditionalRateTable,
} from "@avantej-core/services/commission/context";
import type { PlanInput } from "@avantej-core/services/commission/plan";

// ---------------------------------------------------------------------------
// MemberSnapshot factory
// ---------------------------------------------------------------------------

export function makeMemberSnapshot(
	overrides: Partial<MemberSnapshot> = {},
): MemberSnapshot {
	return {
		userId: "trainer-user-001",
		role: "trainer",
		trainerTierId: "tier-A",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// RateTable factories
// ---------------------------------------------------------------------------

export function makeRateTable(overrides: Partial<RateTable> = {}): RateTable {
	return {
		isConditional: false,
		tierRates: [{ trainerTierId: "tier-A", amount: 5000 }],
		...overrides,
	};
}

export function makeConditionalRateTable(
	overrides: Partial<ConditionalRateTable> = {},
): ConditionalRateTable {
	return {
		isConditional: true,
		conditionRates: [
			{ trainerTierId: "tier-A", amount: 4000, conditionId: "cond-001" },
		],
		matchedConditionId: "cond-001",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// CommissionContext factory
// ---------------------------------------------------------------------------

export interface CommissionContextOverrides {
	configId?: string;
	categoryId?: string;
	paymentType?: "fixed" | "variable";
	isConditional?: boolean;
	rateTable?: RateTable | ConditionalRateTable;
	allSlots?: { slotIndex: number; weightageBasisPoints: number }[];
	memberByUserId?: Map<string, MemberSnapshot>;
	resolvedConfigVersionId?: string;
	maxPerCycleCents?: number | null;
	// Task #17 provenance fields
	resolvedTrackId?: string | null;
	resolvedTrackVersionId?: string | null;
}

export function makeCommissionContext(
	overrides: CommissionContextOverrides = {},
): CommissionContext {
	const configId = overrides.configId ?? "cfg-001";
	const categoryId = overrides.categoryId ?? "cat-001";
	const paymentType = overrides.paymentType ?? "fixed";
	const isConditional = overrides.isConditional ?? false;

	const defaultRateTable: RateTable | ConditionalRateTable = isConditional
		? makeConditionalRateTable()
		: makeRateTable();

	return {
		config: {
			id: configId,
			categoryId,
			paymentType,
			isConditional,
			isActive: true,
			maxPerCycleCents: overrides.maxPerCycleCents ?? null,
			excludeIfDiscountAbovePct: null,
			// Satisfy the full inferred type — unused fields set to reasonable defaults
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		} as CommissionContext["config"],
		rateTable: overrides.rateTable ?? defaultRateTable,
		allSlots: overrides.allSlots ?? [
			{ slotIndex: 0, weightageBasisPoints: 10000 },
		],
		memberByUserId: overrides.memberByUserId ?? new Map(),
		resolvedConfigVersionId: overrides.resolvedConfigVersionId ?? "cfg-ver-001",
		// Task #17 provenance — default to null (legacy-path fallback) so existing tests
		// that don't need track columns don't have to specify them.
		resolvedTrackId: overrides.resolvedTrackId ?? null,
		resolvedTrackVersionId: overrides.resolvedTrackVersionId ?? null,
	};
}

// ---------------------------------------------------------------------------
// PlanInput factory
// ---------------------------------------------------------------------------

export interface PlanInputOverrides {
	matchMode?: "operator" | "threshold";
	quantity?: number;
	matchValue?: number;
	requireTrainerRole?: boolean;
	staffAssignments?: { staffId: string; slotIndex: number }[];
	unitPriceCents?: number;
	appointmentId?: string | undefined;
	salesOrderId?: string | undefined;
	actor?: { userId: string; memberId: string; role: string };
	earnedAt?: Date;
	earnReason?: string;
}

export function makePlanInput(overrides: PlanInputOverrides = {}): PlanInput {
	return {
		matchMode: overrides.matchMode ?? "operator",
		quantity: overrides.quantity ?? 1,
		matchValue: overrides.matchValue ?? 1,
		requireTrainerRole: overrides.requireTrainerRole ?? true,
		staffAssignments: overrides.staffAssignments ?? [
			{ staffId: "trainer-user-001", slotIndex: 0 },
		],
		unitPriceCents: overrides.unitPriceCents ?? 10000,
		appointmentId: overrides.appointmentId ?? "appt-001",
		salesOrderId: overrides.salesOrderId ?? undefined,
		actor: overrides.actor ?? {
			userId: "actor-user",
			memberId: "actor-member",
			role: "admin",
		},
		earnedAt: overrides.earnedAt ?? new Date("2026-01-15T10:00:00.000Z"),
		earnReason: (overrides.earnReason ??
			"completion") as PlanInput["earnReason"],
	};
}

// ---------------------------------------------------------------------------
// Convenience: build a context + map with a single trainer member
// ---------------------------------------------------------------------------

export function makeContextWithTrainer(
	trainerId: string,
	tierId: string,
	contextOverrides: CommissionContextOverrides = {},
): CommissionContext {
	const member = makeMemberSnapshot({
		userId: trainerId,
		trainerTierId: tierId,
	});
	const memberByUserId = new Map<string, MemberSnapshot>();
	memberByUserId.set(trainerId, member);
	return makeCommissionContext({ memberByUserId, ...contextOverrides });
}
