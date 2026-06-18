/**
 * Golden Fixture Capture — Task #1 (Commission Tracks Phase 1)
 *
 * Drives the ORIGINAL commission engine (calculateCommissionForAppointment +
 * calculateCommissionForPos) with a representative corpus of inputs, then
 * writes the resulting split rows to commission-golden.json.
 *
 * THIS TEST MUST ONLY BE RUN AGAINST THE UNMODIFIED ENGINE.
 * After Phase 1 refactor, Agent B replays the same corpus against the
 * new engine and diffs against this fixture.
 *
 * Corpus coverage:
 *   A1 — full-pool single trainer (appointment, non-conditional, fixed rate)
 *   A2 — partial pool redistribution (2 slots, 1 present)
 *   A3 — no-show earnReason (appointment)
 *   A4 — cancellation earnReason (appointment)
 *   A5 — conditional (operator): attendeeCount matches threshold
 *   A6 — tier-rate miss (trainer tier has no rate → skip, return [])
 *   P1 — POS multi-quantity (quantity=3, non-conditional, variable rate)
 *   P2 — POS conditional (threshold): quantity matches minQuantity condition
 *   P3 — POS multi-quantity no-match condition → returns []
 */

import { describe, test, expect } from "bun:test";
import { mock } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	createMockTenantDb,
	selectChainResolving as sel,
} from "../helpers/db-mock.factory";

// ---------------------------------------------------------------------------
// Shared fixture IDs
// ---------------------------------------------------------------------------

const IDS = {
	TRAINER_USER_ID: "trainer-user-001",
	TRAINER_USER_ID_2: "trainer-user-002",
	TIER_ID_A: "tier-A",
	TIER_ID_B: "tier-B",
	TIER_ID_UNKNOWN: "tier-unknown",
	APPOINTMENT_ID: "appt-001",
	SALES_ORDER_ID: "so-001",
	SERVICE_ID: "svc-001",
	CATEGORY_ID: "cat-001",
	CONFIG_ID: "cfg-001",
	CONFIG_VERSION_ID: "cfg-ver-001",
	SLOT_ID_0: "slot-0",
	SLOT_ID_1: "slot-1",
	RATE_ID_A: "rate-A",
	RATE_ID_B: "rate-B",
	CONDITION_ID: "cond-001",
	ACTOR: {
		userId: "actor-user",
		memberId: "actor-member",
		role: "admin",
	},
} as const;

// ---------------------------------------------------------------------------
// Mock DB builders
// ---------------------------------------------------------------------------

/** Silent insert chain (returns provided value, second call returns audit row) */
function makeInsertMock(firstResult: unknown[]) {
	let callIdx = 0;
	return mock(() => {
		callIdx++;
		const result = callIdx === 1 ? firstResult : [{ id: `audit-${callIdx}` }];
		const returning = mock(() => Promise.resolve(result));
		return { values: mock(() => ({ returning })) };
	});
}

/**
 * Build a mock DB for A1: single trainer, full pool (slotIndex=0, weight=10000bp),
 * non-conditional fixed rate, no cap.
 */
function buildA1Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // services
			case 2:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
						maxPerCycleCents: null,
						excludeIfDiscountAbovePct: null,
					},
				]); // config
			case 3:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 5000 }]); // tierRates
			case 4:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]); // coachSlots
			case 5:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_A,
					},
				]); // members
			case 6:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]); // configVersions (latestVersion)
			case 7:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // applyCommissionCaps: category resolve (appt+service join)
			case 8:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]); // applyCommissionCaps: cap config
			default:
				return sel([]);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

/**
 * Build a mock DB for A2: 2 slots (50/50), only 1 trainer present → redistribution
 * The present trainer gets full 10000bp effective weightage.
 */
function buildA2Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 2:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
						maxPerCycleCents: null,
						excludeIfDiscountAbovePct: null,
					},
				]);
			case 3:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 3000 }]);
			case 4:
				return sel([
					{ slotIndex: 0, weightageBasisPoints: 5000 },
					{ slotIndex: 1, weightageBasisPoints: 5000 },
				]);
			case 5:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_A,
					},
				]);
			case 6:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]);
			case 7:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 8:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]);
			default:
				return sel([]);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

/**
 * Build a mock DB for A5: conditional (attendeeCount operator match)
 * isConditional=true, operator='gte', threshold=2 — attendeeCount=3 → matches
 */
function buildA5Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 2:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
						maxPerCycleCents: null,
						excludeIfDiscountAbovePct: null,
					},
				]);
			case 3:
				return sel([
					// conditions
					{
						id: IDS.CONDITION_ID,
						configId: IDS.CONFIG_ID,
						conditionIndex: 0,
						operator: "gte",
						threshold: 2,
						thresholdMax: null,
						minQuantity: null,
					},
				]);
			case 4:
				return sel([
					// conditionRates
					{
						trainerTierId: IDS.TIER_ID_A,
						amount: 4000,
						conditionId: IDS.CONDITION_ID,
					},
				]);
			case 5:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]);
			case 6:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_A,
					},
				]);
			case 7:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]);
			case 8:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 9:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]);
			default:
				return sel([]);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

/**
 * Build a mock DB for A6: tier-rate miss (trainer has tier but config has no rate for it).
 * Returns [].
 */
function buildA6Db() {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 2:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
						maxPerCycleCents: null,
						excludeIfDiscountAbovePct: null,
					},
				]);
			case 3:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 5000 }]); // rate for TIER_ID_A only
			case 4:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]);
			case 5:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_UNKNOWN,
					},
				]); // tier not in rates
			case 6:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]);
			// no cap calls because we skip before insert
			default:
				return sel([]);
		}
	});
	// insert is for audit only (skip audit)
	db.insert.mockImplementation(makeInsertMock([]));
	return db;
}

/**
 * Build a mock DB for P1: POS multi-quantity (quantity=3), non-conditional, variable rate.
 * rateAmount=1000bp (10%), unitPrice=10000 → base=1000, finalAmount = floor(1000*10000*3/10000) = 3000
 * POS path: requireTrainerRole=false, no salesOrders comp-check (no complimentaryReason)
 */
function buildP1Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 2:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "variable",
						isConditional: false,
						isActive: true,
						maxPerCycleCents: null,
						excludeIfDiscountAbovePct: null,
					},
				]);
			case 3:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 1000 }]); // 10% in bp
			case 4:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]);
			// no members batch (requireTrainerRole=false)
			// salesOrders comp check: no complimentaryReason
			case 5:
				return sel([{ complimentaryReason: null }]); // salesOrders comp check
			case 6:
				return sel([{ id: IDS.SALES_ORDER_ID }]); // salesOrderItems active line
			case 7:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]);
			// individual member fetch inside per-staff loop (POS path — before cap calls)
			case 8:
				return sel([{ role: "trainer", trainerTierId: IDS.TIER_ID_A }]);
			case 9:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // cap: category resolve via salesOrderItems+services
			case 10:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]); // cap config
			default:
				return sel([]);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

/**
 * Build a mock DB for P2: POS conditional threshold (minQuantity match).
 * quantity=5, condition has minQuantity=3 → matches.
 */
function buildP2Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 2:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
						maxPerCycleCents: null,
						excludeIfDiscountAbovePct: null,
					},
				]);
			case 3:
				return sel([
					// conditions ordered by minQuantity DESC
					{
						id: IDS.CONDITION_ID,
						configId: IDS.CONFIG_ID,
						conditionIndex: 0,
						operator: "gte",
						threshold: 1,
						thresholdMax: null,
						minQuantity: 3,
					},
				]);
			case 4:
				return sel([
					// conditionRates
					{
						trainerTierId: IDS.TIER_ID_A,
						amount: 6000,
						conditionId: IDS.CONDITION_ID,
					},
				]);
			case 5:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]);
			case 6:
				return sel([{ complimentaryReason: null }]); // salesOrders comp
			case 7:
				return sel([{ id: IDS.SALES_ORDER_ID }]); // active line
			case 8:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]);
			// individual member fetch inside per-staff loop (POS path — before cap calls)
			case 9:
				return sel([{ role: "trainer", trainerTierId: IDS.TIER_ID_A }]);
			case 10:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // cap: category
			case 11:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]);
			default:
				return sel([]);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

/**
 * Build a mock DB for P3: POS conditional no-match (quantity < minQuantity) → []
 */
function buildP3Db() {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]);
			case 2:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
						maxPerCycleCents: null,
						excludeIfDiscountAbovePct: null,
					},
				]);
			case 3:
				return sel([
					// conditions — minQuantity=5, quantity=2 → no match
					{
						id: IDS.CONDITION_ID,
						configId: IDS.CONFIG_ID,
						conditionIndex: 0,
						operator: "gte",
						threshold: 1,
						thresholdMax: null,
						minQuantity: 5,
					},
				]);
			default:
				return sel([]);
		}
	});
	db.insert.mockImplementation(makeInsertMock([]));
	return db;
}

// ---------------------------------------------------------------------------
// Stable split shape (deterministic for fixture)
// ---------------------------------------------------------------------------

function makeSplitRow(overrides: Record<string, unknown> = {}) {
	const now = new Date("2026-01-15T10:00:00.000Z");
	return {
		id: "split-fixture-001",
		appointmentId: IDS.APPOINTMENT_ID,
		salesOrderId: null,
		packageInstanceId: null,
		staffId: IDS.TRAINER_USER_ID,
		splitPercentage: 0,
		calculatedAmount: 5000,
		status: "pending",
		splitType: "automatic",
		earnReason: "completion",
		earnedAt: now.toISOString(),
		notes: null,
		slotIndex: 0,
		conditionId: null,
		trainerTierId: IDS.TIER_ID_A,
		weightageBasisPoints: 10000,
		baseAmountCents: 5000,
		createdByUserId: null,
		configVersionId: IDS.CONFIG_VERSION_ID,
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Fixture output path
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(
	import.meta.dirname,
	"commission-golden.json",
);

// ---------------------------------------------------------------------------
// The test suite — captures golden output
// ---------------------------------------------------------------------------
//
// SUPERSEDED ONE-TIME GENERATOR — skipped by default.
//   * The golden oracle (`commission-golden.json`) is already committed and is
//     now write-once (see the WRITE-FIXTURE guard below).
//   * The LIVE regression guard is `commission-diff-harness.test.ts`, whose mocks
//     were migrated to the commission-tracks model (Phase 2). This generator's
//     own mocks are still config-only (Phase 1), so its corpus assertions no
//     longer match the track-first engine — they are stale, not a regression.
//   * To intentionally regenerate the oracle: delete `commission-golden.json`,
//     migrate the mock builders below to the track model, change `describe.skip`
//     → `describe`, and run THIS file IN ISOLATION (Bun mock.module is
//     process-global — a combined run corrupts the capture).
describe.skip("Commission Golden Fixture Capture", () => {
	const results: Record<string, unknown[]> = {};

	test("A1 — full-pool single trainer, fixed rate, completion", async () => {
		const { calculateCommissionForAppointment } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const expectedSplit = makeSplitRow({ earnReason: "completion" });
		const db = buildA1Db([expectedSplit]);
		const splits = await calculateCommissionForAppointment(db, {
			appointmentId: IDS.APPOINTMENT_ID,
			serviceId: IDS.SERVICE_ID,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "completion",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(1);
		results["A1"] = splits;
	});

	test("A2 — 2-slot partial pool redistribution, 1 trainer present", async () => {
		const { calculateCommissionForAppointment } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		// With 2 slots (5000bp each) and only slot-0 present, trainer gets 10000bp effective
		// base=3000, effectiveWeightage=10000, quantity=1 → final=floor(3000*10000*1/10000)=3000
		const expectedSplit = makeSplitRow({
			earnReason: "completion",
			calculatedAmount: 3000,
			baseAmountCents: 3000,
			weightageBasisPoints: 10000,
		});
		const db = buildA2Db([expectedSplit]);
		const splits = await calculateCommissionForAppointment(db, {
			appointmentId: IDS.APPOINTMENT_ID,
			serviceId: IDS.SERVICE_ID,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }], // only slot 0 present
			actor: IDS.ACTOR,
			earnReason: "completion",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(1);
		results["A2"] = splits;
	});

	test("A3 — no-show earnReason", async () => {
		const { calculateCommissionForAppointment } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const expectedSplit = makeSplitRow({ earnReason: "no_show" });
		const db = buildA1Db([expectedSplit]);
		const splits = await calculateCommissionForAppointment(db, {
			appointmentId: IDS.APPOINTMENT_ID,
			serviceId: IDS.SERVICE_ID,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "no_show",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(1);
		results["A3"] = splits;
	});

	test("A4 — cancellation earnReason", async () => {
		const { calculateCommissionForAppointment } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const expectedSplit = makeSplitRow({ earnReason: "cancellation" });
		const db = buildA1Db([expectedSplit]);
		const splits = await calculateCommissionForAppointment(db, {
			appointmentId: IDS.APPOINTMENT_ID,
			serviceId: IDS.SERVICE_ID,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "cancellation",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(1);
		results["A4"] = splits;
	});

	test("A5 — conditional operator match (attendeeCount >=2, actual=3)", async () => {
		const { calculateCommissionForAppointment } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const expectedSplit = makeSplitRow({
			earnReason: "completion",
			calculatedAmount: 4000,
			baseAmountCents: 4000,
			conditionId: IDS.CONDITION_ID,
		});
		const db = buildA5Db([expectedSplit]);
		const splits = await calculateCommissionForAppointment(db, {
			appointmentId: IDS.APPOINTMENT_ID,
			serviceId: IDS.SERVICE_ID,
			sessionTotalCents: 10000,
			attendeeCount: 3,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "completion",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(1);
		results["A5"] = splits;
	});

	test("A6 — tier-rate miss → returns []", async () => {
		const { calculateCommissionForAppointment } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const db = buildA6Db();
		const splits = await calculateCommissionForAppointment(db, {
			appointmentId: IDS.APPOINTMENT_ID,
			serviceId: IDS.SERVICE_ID,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "completion",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(0);
		results["A6"] = splits;
	});

	test("P1 — POS multi-quantity (qty=3), variable rate 10%, no cap", async () => {
		const { calculateCommissionForPos } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		// base = floor(10000 * 1000 / 10000) = 1000
		// final = floor(1000 * 10000 * 3 / 10000) = 3000
		const expectedSplit = makeSplitRow({
			appointmentId: null,
			salesOrderId: IDS.SALES_ORDER_ID,
			earnReason: "pos_product",
			calculatedAmount: 3000,
			baseAmountCents: 1000,
			weightageBasisPoints: 10000,
			splitPercentage: 10, // 1000bp * 10000bp / 1_000_000 = 10
		});
		const db = buildP1Db([expectedSplit]);
		const splits = await calculateCommissionForPos(db, {
			salesOrderId: IDS.SALES_ORDER_ID,
			serviceId: IDS.SERVICE_ID,
			unitPriceCents: 10000,
			quantity: 3,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "pos_product",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(1);
		results["P1"] = splits;
	});

	test("P2 — POS conditional threshold match (qty=5, minQuantity=3)", async () => {
		const { calculateCommissionForPos } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const expectedSplit = makeSplitRow({
			appointmentId: null,
			salesOrderId: IDS.SALES_ORDER_ID,
			earnReason: "pos_product",
			calculatedAmount: 6000,
			baseAmountCents: 6000,
			weightageBasisPoints: 10000,
			conditionId: IDS.CONDITION_ID,
		});
		const db = buildP2Db([expectedSplit]);
		const splits = await calculateCommissionForPos(db, {
			salesOrderId: IDS.SALES_ORDER_ID,
			serviceId: IDS.SERVICE_ID,
			unitPriceCents: 10000,
			quantity: 5,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "pos_product",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(1);
		results["P2"] = splits;
	});

	test("P3 — POS conditional no-match (qty=2, minQuantity=5) → []", async () => {
		const { calculateCommissionForPos } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const db = buildP3Db();
		const splits = await calculateCommissionForPos(db, {
			salesOrderId: IDS.SALES_ORDER_ID,
			serviceId: IDS.SERVICE_ID,
			unitPriceCents: 10000,
			quantity: 2,
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "pos_product",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});
		expect(splits).toHaveLength(0);
		results["P3"] = splits;
	});

	// Write fixture at the end — after all sub-tests have run
	test("WRITE-FIXTURE — persist golden.json", () => {
		// Normalize dates to ISO strings for stable JSON
		function normalize(obj: unknown): unknown {
			if (obj instanceof Date) return obj.toISOString();
			if (Array.isArray(obj)) return obj.map(normalize);
			if (obj !== null && typeof obj === "object") {
				const out: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
					out[k] = normalize(v);
				}
				return out;
			}
			return obj;
		}

		const fixture = {
			_meta: {
				capturedAt: new Date("2026-01-15T10:00:00.000Z").toISOString(),
				description:
					"Golden fixture for commission engine Phase 1 refactor. Generated from ORIGINAL engine. DO NOT EDIT MANUALLY.",
				corpus: ["A1", "A2", "A3", "A4", "A5", "A6", "P1", "P2", "P3"],
			},
			cases: normalize(results),
		};

		// WRITE-ONCE GUARD: the golden fixture is an IMMUTABLE oracle captured from the
		// original engine. Re-running this generator in a combined test batch corrupts it
		// (Bun mock.module is process-global — see project memory). Never overwrite an
		// existing fixture; to intentionally regenerate, delete the file first and run THIS
		// file in isolation.
		if (fs.existsSync(FIXTURE_PATH)) {
			console.log(
				`[commission-golden] Fixture already exists — NOT overwriting (write-once oracle).`,
			);
		} else {
			fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
			console.log(`[commission-golden] Fixture written to ${FIXTURE_PATH}`);
		}

		// Confirm file written
		expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
		const parsed = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
		// Verify at least A1 has a split
		expect(Array.isArray((parsed.cases as Record<string, unknown>)["A1"])).toBe(
			true,
		);
	});
});
