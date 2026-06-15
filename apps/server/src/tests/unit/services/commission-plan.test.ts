/**
 * Pure unit tests for planSplits (commission pipeline Stage 2).
 *
 * No DB, no mocks needed — planSplits is a pure function that takes a
 * CommissionContext and PlanInput and returns a SplitPlan.
 *
 * Coverage:
 *   - Every SkipReasonCode value under the right condition
 *   - Weightage redistribution (computeEffectiveWeightages) via planSplits
 *   - Multiply-then-floor rounding (fractional cent floors, never rounds up)
 *   - POS path: deferred sentinel outputs (finalAmountCents=0)
 *   - Empty / no-op paths
 */

import { describe, test, expect } from "bun:test";
import { planSplits } from "@avantej-core/services/commission/plan";
import {
	makeCommissionContext,
	makeContextWithTrainer,
	makePlanInput,
	makeRateTable,
	makeConditionalRateTable,
	makeMemberSnapshot,
} from "../../helpers/commission-fixtures.factory";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRAINER_ID = "trainer-user-001";
const TRAINER_ID_2 = "trainer-user-002";
const TIER_A = "tier-A";
const TIER_B = "tier-B";
const TIER_UNKNOWN = "tier-unknown";
const APPT_ID = "appt-001";

// ---------------------------------------------------------------------------
// SkipReason: no_coach_slot
// ---------------------------------------------------------------------------

describe("SkipReason: no_coach_slot", () => {
	test("staff assigned to slotIndex not in config → skipped with no_coach_slot", () => {
		// Config only has slot 0. Assignment is for slot 5.
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A);
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 5 }],
			requireTrainerRole: true,
		});

		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.reason).toBe("no_coach_slot");
		expect(skipped[0]!.staffId).toBe(TRAINER_ID);
		expect(skipped[0]!.slotIndex).toBe(5);
	});

	test("empty staffAssignments returns empty planned+skipped immediately", () => {
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A);
		const input = makePlanInput({ staffAssignments: [] });
		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped).toHaveLength(0);
	});

	test("slot miss carries correct configId, appointmentId", () => {
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A, {
			configId: "cfg-xyz",
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 99 }],
			appointmentId: "appt-999",
			requireTrainerRole: true,
		});
		const { skipped } = planSplits(ctx, input);
		expect(skipped[0]!.configId).toBe("cfg-xyz");
		expect(skipped[0]!.appointmentId).toBe("appt-999");
	});
});

// ---------------------------------------------------------------------------
// SkipReason: member_not_found
// ---------------------------------------------------------------------------

describe("SkipReason: member_not_found", () => {
	test("requireTrainerRole=true, member not in memberByUserId → member_not_found", () => {
		// Context has an empty memberByUserId map
		const ctx = makeCommissionContext({
			memberByUserId: new Map(),
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.reason).toBe("member_not_found");
		expect(skipped[0]!.staffId).toBe(TRAINER_ID);
	});

	test("requireTrainerRole=false — member_not_found is NOT produced at plan stage (deferred to persist)", () => {
		// POS path: no members in map, but requireTrainerRole=false
		const ctx = makeCommissionContext({
			memberByUserId: new Map(),
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: false,
			matchMode: "threshold",
		});
		const { planned, skipped } = planSplits(ctx, input);
		// No member_not_found at plan time — POS defers to persist
		expect(skipped.filter((s) => s.reason === "member_not_found")).toHaveLength(
			0,
		);
		// Should have a deferred sentinel planned split
		expect(planned).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// SkipReason: role_mismatch
// ---------------------------------------------------------------------------

describe("SkipReason: role_mismatch", () => {
	test("requireTrainerRole=true, member role is 'staff' → role_mismatch", () => {
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "staff",
			trainerTierId: TIER_A,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const ctx = makeCommissionContext({ memberByUserId });
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.reason).toBe("role_mismatch");
		expect(skipped[0]!.staffId).toBe(TRAINER_ID);
	});

	test("requireTrainerRole=true, member role is 'admin' → role_mismatch", () => {
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "admin",
			trainerTierId: null,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const ctx = makeCommissionContext({ memberByUserId });
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { skipped } = planSplits(ctx, input);
		expect(skipped[0]!.reason).toBe("role_mismatch");
	});
});

// ---------------------------------------------------------------------------
// SkipReason: no_tier
// ---------------------------------------------------------------------------

describe("SkipReason: no_tier", () => {
	test("requireTrainerRole=true, member role=trainer but trainerTierId=null → no_tier", () => {
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: null,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const ctx = makeCommissionContext({ memberByUserId });
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.reason).toBe("no_tier");
		expect(skipped[0]!.staffId).toBe(TRAINER_ID);
	});
});

// ---------------------------------------------------------------------------
// SkipReason: no_tier_rate
// ---------------------------------------------------------------------------

describe("SkipReason: no_tier_rate", () => {
	test("requireTrainerRole=true, trainer has tier B but config only has rates for tier A → no_tier_rate", () => {
		// Member has TIER_B but rateTable only has entry for TIER_A
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: TIER_B,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const rateTable = makeRateTable({
			tierRates: [{ trainerTierId: TIER_A, amount: 5000 }],
		});
		const ctx = makeCommissionContext({ memberByUserId, rateTable });
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.reason).toBe("no_tier_rate");
		expect(skipped[0]!.staffId).toBe(TRAINER_ID);
		expect(skipped[0]!.trainerTierId).toBe(TIER_B);
	});

	test("no_tier_rate carries correct configId and appointmentId", () => {
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: TIER_UNKNOWN,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const rateTable = makeRateTable({
			tierRates: [{ trainerTierId: TIER_A, amount: 3000 }],
		});
		const ctx = makeCommissionContext({
			memberByUserId,
			rateTable,
			configId: "cfg-abc",
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			appointmentId: APPT_ID,
			requireTrainerRole: true,
		});
		const { skipped } = planSplits(ctx, input);
		expect(skipped[0]!.configId).toBe("cfg-abc");
		expect(skipped[0]!.appointmentId).toBe(APPT_ID);
	});
});

// ---------------------------------------------------------------------------
// SkipReason: no_condition_rate
// ---------------------------------------------------------------------------

describe("SkipReason: no_condition_rate", () => {
	test("conditional config: trainer's tier has no conditionRate entry → no_condition_rate", () => {
		// Condition rate only exists for TIER_A; member has TIER_B
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: TIER_B,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const rateTable = makeConditionalRateTable({
			conditionRates: [
				{ trainerTierId: TIER_A, amount: 4000, conditionId: "cond-001" },
			],
			matchedConditionId: "cond-001",
		});
		const ctx = makeCommissionContext({
			memberByUserId,
			rateTable,
			isConditional: true,
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.reason).toBe("no_condition_rate");
		expect(skipped[0]!.staffId).toBe(TRAINER_ID);
		expect(skipped[0]!.trainerTierId).toBe(TIER_B);
		expect(skipped[0]!.conditionId).toBe("cond-001");
	});
});

// ---------------------------------------------------------------------------
// Redistribution: computeEffectiveWeightages integration via planSplits
// ---------------------------------------------------------------------------

describe("Redistribution: absent slots absorbed by present coaches", () => {
	test("2 slots (5000/5000), 1 trainer present → trainer gets full 10000bp", () => {
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: TIER_A,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const rateTable = makeRateTable({
			tierRates: [{ trainerTierId: TIER_A, amount: 3000 }],
		});
		const ctx = makeCommissionContext({
			memberByUserId,
			rateTable,
			allSlots: [
				{ slotIndex: 0, weightageBasisPoints: 5000 },
				{ slotIndex: 1, weightageBasisPoints: 5000 },
			],
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned).toHaveLength(1);
		expect(planned[0]!.weightageBasisPoints).toBe(10000);
	});

	test("3 slots (4000/3000/3000), only 2 present → sum of effective weightages = 10000", () => {
		const m1 = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: TIER_A,
		});
		const m2 = makeMemberSnapshot({
			userId: TRAINER_ID_2,
			role: "trainer",
			trainerTierId: TIER_A,
		});
		const memberByUserId = new Map([
			[TRAINER_ID, m1],
			[TRAINER_ID_2, m2],
		]);
		const rateTable = makeRateTable({
			tierRates: [{ trainerTierId: TIER_A, amount: 5000 }],
		});
		const ctx = makeCommissionContext({
			memberByUserId,
			rateTable,
			allSlots: [
				{ slotIndex: 0, weightageBasisPoints: 4000 },
				{ slotIndex: 1, weightageBasisPoints: 3000 },
				{ slotIndex: 2, weightageBasisPoints: 3000 }, // absent
			],
		});
		const input = makePlanInput({
			staffAssignments: [
				{ staffId: TRAINER_ID, slotIndex: 0 },
				{ staffId: TRAINER_ID_2, slotIndex: 1 },
			],
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned).toHaveLength(2);
		const totalBp = planned.reduce((s, p) => s + p.weightageBasisPoints, 0);
		expect(totalBp).toBe(10000); // redistribution invariant
	});

	test("redistribution: absent slot bp distributed with remainder to first coach", () => {
		// 4 slots of equal 2500bp. Slots 0,1,2 present, slot 3 absent.
		// unclaimedBP=2500, presentCount=3, bonus=833, remainder=1 → slot-0 gets +1
		const members = new Map([
			[
				TRAINER_ID,
				makeMemberSnapshot({
					userId: TRAINER_ID,
					role: "trainer",
					trainerTierId: TIER_A,
				}),
			],
			[
				TRAINER_ID_2,
				makeMemberSnapshot({
					userId: TRAINER_ID_2,
					role: "trainer",
					trainerTierId: TIER_A,
				}),
			],
			[
				"trainer-user-003",
				makeMemberSnapshot({
					userId: "trainer-user-003",
					role: "trainer",
					trainerTierId: TIER_A,
				}),
			],
		]);
		const rateTable = makeRateTable({
			tierRates: [{ trainerTierId: TIER_A, amount: 5000 }],
		});
		const ctx = makeCommissionContext({
			memberByUserId: members,
			rateTable,
			allSlots: [
				{ slotIndex: 0, weightageBasisPoints: 2500 },
				{ slotIndex: 1, weightageBasisPoints: 2500 },
				{ slotIndex: 2, weightageBasisPoints: 2500 },
				{ slotIndex: 3, weightageBasisPoints: 2500 }, // absent
			],
		});
		const input = makePlanInput({
			staffAssignments: [
				{ staffId: TRAINER_ID, slotIndex: 0 },
				{ staffId: TRAINER_ID_2, slotIndex: 1 },
				{ staffId: "trainer-user-003", slotIndex: 2 },
			],
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned).toHaveLength(3);
		expect(planned[0]!.weightageBasisPoints).toBe(3334); // slot-0 absorbs remainder +1
		expect(planned[1]!.weightageBasisPoints).toBe(3333);
		expect(planned[2]!.weightageBasisPoints).toBe(3333);
		const totalBp = planned.reduce((s, p) => s + p.weightageBasisPoints, 0);
		expect(totalBp).toBe(10000);
	});
});

// ---------------------------------------------------------------------------
// Multiply-then-floor rounding (fixed rates)
// ---------------------------------------------------------------------------

describe("Rounding: multiply-then-floor, never rounds up", () => {
	test("fixed rate: finalAmount = base * weightage * quantity / 10000 (floored)", () => {
		// base=99, weightage=10000 (full), quantity=1 → floor(99*10000*1/10000)=99
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A, {
			paymentType: "fixed",
			rateTable: makeRateTable({
				tierRates: [{ trainerTierId: TIER_A, amount: 99 }],
			}),
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			quantity: 1,
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.finalAmountCents).toBe(99);
	});

	test("fixed rate: 2 slots equal 5000bp each, base=99, qty=1 → floor(99*5000*1/10000)=49 each", () => {
		const members = new Map([
			[
				TRAINER_ID,
				makeMemberSnapshot({
					userId: TRAINER_ID,
					role: "trainer",
					trainerTierId: TIER_A,
				}),
			],
			[
				TRAINER_ID_2,
				makeMemberSnapshot({
					userId: TRAINER_ID_2,
					role: "trainer",
					trainerTierId: TIER_A,
				}),
			],
		]);
		const rateTable = makeRateTable({
			tierRates: [{ trainerTierId: TIER_A, amount: 99 }],
		});
		const ctx = makeCommissionContext({
			memberByUserId: members,
			rateTable,
			paymentType: "fixed",
			allSlots: [
				{ slotIndex: 0, weightageBasisPoints: 5000 },
				{ slotIndex: 1, weightageBasisPoints: 5000 },
			],
		});
		const input = makePlanInput({
			staffAssignments: [
				{ staffId: TRAINER_ID, slotIndex: 0 },
				{ staffId: TRAINER_ID_2, slotIndex: 1 },
			],
			quantity: 1,
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned).toHaveLength(2);
		// floor(99 * 5000 * 1 / 10000) = floor(49.5) = 49
		expect(planned[0]!.finalAmountCents).toBe(49);
		expect(planned[1]!.finalAmountCents).toBe(49);
		// Confirms floor, not round (would be 50 if rounding up)
	});

	test("variable rate: base computed as floor(unitPrice * rateBp / 10000), final also floored", () => {
		// unitPrice=10000, rateBp=1000 (10%), base=floor(10000*1000/10000)=1000
		// qty=3, weightage=10000 → final=floor(1000*10000*3/10000)=3000
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A, {
			paymentType: "variable",
			rateTable: makeRateTable({
				tierRates: [{ trainerTierId: TIER_A, amount: 1000 }],
			}),
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			unitPriceCents: 10000,
			quantity: 3,
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.baseAmountCents).toBe(1000);
		expect(planned[0]!.finalAmountCents).toBe(3000);
	});

	test("variable rate: fractional base floors (never rounds up)", () => {
		// unitPrice=333, rateBp=1000 → base=floor(333*1000/10000)=floor(33.3)=33
		// qty=1, weightage=10000 → final=floor(33*10000*1/10000)=33
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A, {
			paymentType: "variable",
			rateTable: makeRateTable({
				tierRates: [{ trainerTierId: TIER_A, amount: 1000 }],
			}),
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			unitPriceCents: 333,
			quantity: 1,
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.baseAmountCents).toBe(33); // floor(33.3)
		expect(planned[0]!.finalAmountCents).toBe(33); // not 34
	});
});

// ---------------------------------------------------------------------------
// POS path: sentinel outputs deferred to persist
// ---------------------------------------------------------------------------

describe("POS path (requireTrainerRole=false): sentinel planned splits", () => {
	test("POS: produces planned split with sentinel amounts (0) for persist to resolve", () => {
		const ctx = makeCommissionContext({
			memberByUserId: new Map(), // no members pre-fetched in POS path
			paymentType: "variable",
			rateTable: makeRateTable({
				tierRates: [{ trainerTierId: TIER_A, amount: 1000 }],
			}),
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: false,
			matchMode: "threshold",
			quantity: 3,
			unitPriceCents: 10000,
			appointmentId: undefined,
			salesOrderId: "so-001",
		});
		const { planned, skipped } = planSplits(ctx, input);
		expect(skipped).toHaveLength(0);
		expect(planned).toHaveLength(1);
		// Sentinel values
		expect(planned[0]!.finalAmountCents).toBe(0);
		expect(planned[0]!.baseAmountCents).toBe(0);
		expect(planned[0]!.splitPercentage).toBe(0);
		expect(planned[0]!.trainerTierId).toBeNull();
		// But slot/weightage info is correctly set
		expect(planned[0]!.slotIndex).toBe(0);
		expect(planned[0]!.weightageBasisPoints).toBe(10000);
	});

	test("POS: configVersionId is passed through on sentinel", () => {
		const ctx = makeCommissionContext({
			memberByUserId: new Map(),
			resolvedConfigVersionId: "ver-xyz",
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: false,
			matchMode: "threshold",
		});
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.configVersionId).toBe("ver-xyz");
	});

	test("POS: conditionId from rateTable is set on sentinel even when amounts are 0", () => {
		const rateTable = makeConditionalRateTable({
			matchedConditionId: "cond-abc",
		});
		const ctx = makeCommissionContext({
			memberByUserId: new Map(),
			rateTable,
			isConditional: true,
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: false,
			matchMode: "threshold",
		});
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.conditionId).toBe("cond-abc");
	});
});

// ---------------------------------------------------------------------------
// Conditional rates (appointment path)
// ---------------------------------------------------------------------------

describe("Conditional rates (appointment path)", () => {
	test("conditional config: trainer with matching conditionRate produces a split", () => {
		const member = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: TIER_A,
		});
		const memberByUserId = new Map([[TRAINER_ID, member]]);
		const rateTable = makeConditionalRateTable({
			conditionRates: [
				{ trainerTierId: TIER_A, amount: 4000, conditionId: "cond-001" },
			],
			matchedConditionId: "cond-001",
		});
		const ctx = makeCommissionContext({
			memberByUserId,
			rateTable,
			isConditional: true,
			paymentType: "fixed",
		});
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned, skipped } = planSplits(ctx, input);
		expect(skipped).toHaveLength(0);
		expect(planned).toHaveLength(1);
		expect(planned[0]!.conditionId).toBe("cond-001");
		expect(planned[0]!.baseAmountCents).toBe(4000);
		expect(planned[0]!.finalAmountCents).toBe(4000);
	});

	test("non-conditional config: conditionId is null on planned split", () => {
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A);
		const input = makePlanInput({
			staffAssignments: [{ staffId: TRAINER_ID, slotIndex: 0 }],
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.conditionId).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Dedupe: duplicate slotIndex in staffAssignments
// ---------------------------------------------------------------------------

describe("Dedupe: duplicate slotIndex handled", () => {
	test("two assignments with same slotIndex → only one planned (last wins)", () => {
		const m1 = makeMemberSnapshot({
			userId: TRAINER_ID,
			role: "trainer",
			trainerTierId: TIER_A,
		});
		const m2 = makeMemberSnapshot({
			userId: TRAINER_ID_2,
			role: "trainer",
			trainerTierId: TIER_A,
		});
		const memberByUserId = new Map([
			[TRAINER_ID, m1],
			[TRAINER_ID_2, m2],
		]);
		const ctx = makeCommissionContext({ memberByUserId });
		const input = makePlanInput({
			staffAssignments: [
				{ staffId: TRAINER_ID, slotIndex: 0 },
				{ staffId: TRAINER_ID_2, slotIndex: 0 }, // duplicate slot
			],
			requireTrainerRole: true,
		});
		const { planned } = planSplits(ctx, input);
		expect(planned).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Empty slot config
// ---------------------------------------------------------------------------

describe("Empty slot config", () => {
	test("config with no slots: assertConfigSumIs10000 does not throw; returns empty planned", () => {
		const ctx = makeCommissionContext({
			allSlots: [], // empty config
			memberByUserId: new Map([[TRAINER_ID, makeMemberSnapshot()]]),
		});
		const input = makePlanInput({ requireTrainerRole: true });
		// Should not throw but all assignments get no_coach_slot
		const { planned, skipped } = planSplits(ctx, input);
		expect(planned).toHaveLength(0);
		expect(skipped[0]!.reason).toBe("no_coach_slot");
	});
});

// ---------------------------------------------------------------------------
// splitPercentage calculation
// ---------------------------------------------------------------------------

describe("splitPercentage calculation", () => {
	test("fixed rate: splitPercentage is always 0", () => {
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A, {
			paymentType: "fixed",
		});
		const input = makePlanInput({ requireTrainerRole: true });
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.splitPercentage).toBe(0);
	});

	test("variable rate: splitPercentage = round(rateBp * weightage / 1_000_000)", () => {
		// rateBp=1000 (10%), weightage=10000 → round(1000*10000/1_000_000) = round(10) = 10
		const ctx = makeContextWithTrainer(TRAINER_ID, TIER_A, {
			paymentType: "variable",
			rateTable: makeRateTable({
				tierRates: [{ trainerTierId: TIER_A, amount: 1000 }],
			}),
		});
		const input = makePlanInput({ requireTrainerRole: true });
		const { planned } = planSplits(ctx, input);
		expect(planned[0]!.splitPercentage).toBe(10);
	});
});
