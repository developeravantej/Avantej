/**
 * Commission Behavior-Diff Harness — Task #8 (Phase 1b)
 *
 * Replays the SAME corpus used in commission-golden.capture.test.ts through
 * the NEW refactored pipeline and asserts output is byte-identical to the
 * golden snapshot at apps/server/src/tests/fixtures/commission-golden.json.
 *
 * The mock DB builders here are IDENTICAL to those in the capture test.
 * If any case produces a diff, the test fails with a detailed diff report
 * so the regression can be fixed in the pipeline — NOT in this test.
 *
 * Transport note: this file is a standalone bun:test file.
 * If mock.module conflicts arise with the combined run (bun test src/tests/unit/services),
 * run it isolated:
 *   cd apps/server && bun test src/tests/unit/services/commission-diff-harness.test.ts
 * or via:
 *   bun run scripts/run-integration-isolated.ts
 *
 * Corpus:
 *   A1 — full-pool single trainer, fixed rate, completion
 *   A2 — 2-slot partial pool redistribution
 *   A3 — no-show earnReason
 *   A4 — cancellation earnReason
 *   A5 — conditional operator match (attendeeCount>=2, actual=3)
 *   A6 — tier-rate miss → []
 *   P1 — POS multi-quantity (qty=3), variable rate 10%, no cap
 *   P2 — POS conditional threshold match (qty=5, minQuantity=3)
 *   P3 — POS conditional no-match (qty=2, minQuantity=5) → []
 */

import { describe, test, expect } from "bun:test";
import { mock } from "bun:test";
import * as path from "node:path";
import * as fs from "node:fs";
import {
	createMockTenantDb,
	selectChainResolving as sel,
} from "../../helpers/db-mock.factory";

// ---------------------------------------------------------------------------
// Shared fixture IDs — must match commission-golden.capture.test.ts exactly
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
	TRACK_ID: "track-001",
	TRACK_VERSION_ID: "track-ver-001",
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
// Mock DB helpers — `sel` is the canonical selectChainResolving from the
// factory (identical chain shape the capture test uses).
//
// Each builder maps select calls positionally via switch(n). The `default`
// branch THROWS (rather than silently returning sel([])) so that adding or
// reordering a query in the pipeline surfaces as a loud, indexed failure
// instead of a misaligned empty result that corrupts the golden diff.
// ---------------------------------------------------------------------------

// Throws on an unmapped positional select call so misalignment fails loudly.
// The failing test()'s name identifies which corpus case (A1/A2/…/P3) drove it.
function unmappedSelect(n: number): never {
	throw new Error(
		`[commission-diff-harness] unmapped select call #${n}. ` +
			`The pipeline made more select() calls than this builder maps. ` +
			`Add an explicit case for #${n} (return sel([...]) with the expected ` +
			`rows) — do NOT widen a default, or the golden diff will silently drift.`,
	);
}

function makeInsertMock(firstResult: unknown[]) {
	let callIdx = 0;
	return mock(() => {
		callIdx++;
		const result = callIdx === 1 ? firstResult : [{ id: `audit-${callIdx}` }];
		const returning = mock(() => Promise.resolve(result));
		return { values: mock(() => ({ returning })) };
	});
}

function buildA1Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			// loadCommissionContext — track path
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // service → categoryId
			case 2:
				return sel([
					{
						id: IDS.TRACK_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
						roleType: "trainer",
						trigger: "on_completion",
					},
				]); // delivery track
			case 3:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
					},
				]); // backing config
			case 4:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 5000 }]); // commissionTrackRates
			case 5:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]); // coach slots by trackId
			case 6:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_A,
					},
				]); // members batch
			case 7:
				return sel([{ id: IDS.TRACK_VERSION_ID }]); // commissionTrackVersions
			case 8:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]); // categoryCommissionConfigVersions (legacy)
			// applyCommissionCaps
			case 9:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // resolveCategoryIdForSplit
			case 10:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]); // commissionTracks cap config
			default:
				return unmappedSelect(n);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

function buildA2Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			// loadCommissionContext — track path
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // service → categoryId
			case 2:
				return sel([
					{
						id: IDS.TRACK_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
						roleType: "trainer",
						trigger: "on_completion",
					},
				]); // delivery track
			case 3:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
					},
				]); // backing config
			case 4:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 3000 }]); // commissionTrackRates
			case 5:
				return sel([
					{ slotIndex: 0, weightageBasisPoints: 5000 },
					{ slotIndex: 1, weightageBasisPoints: 5000 },
				]); // coach slots by trackId
			case 6:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_A,
					},
				]); // members batch
			case 7:
				return sel([{ id: IDS.TRACK_VERSION_ID }]); // commissionTrackVersions
			case 8:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]); // categoryCommissionConfigVersions (legacy)
			// applyCommissionCaps
			case 9:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // resolveCategoryIdForSplit
			case 10:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]); // commissionTracks cap config
			default:
				return unmappedSelect(n);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

function buildA5Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			// loadCommissionContext — track path (conditional operator)
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // service → categoryId
			case 2:
				return sel([
					{
						id: IDS.TRACK_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
						roleType: "trainer",
						trigger: "on_completion",
					},
				]); // delivery track
			case 3:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
					},
				]); // backing config
			case 4:
				return sel([
					{
						id: IDS.CONDITION_ID,
						configId: IDS.CONFIG_ID,
						conditionIndex: 0,
						operator: "gte",
						threshold: 2,
						thresholdMax: null,
						minQuantity: null,
					},
				]); // commissionConditions
			case 5:
				return sel([
					{
						trainerTierId: IDS.TIER_ID_A,
						amount: 4000,
						conditionId: IDS.CONDITION_ID,
					},
				]); // commissionConditionRates
			case 6:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]); // coach slots by trackId
			case 7:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_A,
					},
				]); // members batch
			case 8:
				return sel([{ id: IDS.TRACK_VERSION_ID }]); // commissionTrackVersions
			case 9:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]); // categoryCommissionConfigVersions (legacy)
			// applyCommissionCaps
			case 10:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // resolveCategoryIdForSplit
			case 11:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]); // commissionTracks cap config
			default:
				return unmappedSelect(n);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

function buildA6Db() {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			// loadCommissionContext — track path (tier-rate miss: TIER_UNKNOWN has no rate)
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // service → categoryId
			case 2:
				return sel([
					{
						id: IDS.TRACK_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
						roleType: "trainer",
						trigger: "on_completion",
					},
				]); // delivery track
			case 3:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: false,
						isActive: true,
					},
				]); // backing config
			case 4:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 5000 }]); // commissionTrackRates (TIER_ID_A only, not UNKNOWN)
			case 5:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]); // coach slots by trackId
			case 6:
				return sel([
					{
						userId: IDS.TRAINER_USER_ID,
						role: "trainer",
						trainerTierId: IDS.TIER_ID_UNKNOWN,
					},
				]); // members batch
			case 7:
				return sel([{ id: IDS.TRACK_VERSION_ID }]); // commissionTrackVersions
			case 8:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]); // categoryCommissionConfigVersions (legacy)
			// plan.ts skips this staff (no_tier_rate) — persistSplits returns [] — no cap check
			default:
				return unmappedSelect(n);
		}
	});
	db.insert.mockImplementation(makeInsertMock([]));
	return db;
}

function buildP1Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			// loadCommissionContext — track path (POS, no members batch)
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // service → categoryId
			case 2:
				return sel([
					{
						id: IDS.TRACK_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "variable",
						isConditional: false,
						isActive: true,
						roleType: "trainer",
						trigger: "on_completion",
					},
				]); // delivery track
			case 3:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "variable",
						isConditional: false,
						isActive: true,
					},
				]); // backing config
			case 4:
				return sel([{ trainerTierId: IDS.TIER_ID_A, amount: 1000 }]); // commissionTrackRates
			case 5:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]); // coach slots by trackId (no members batch for POS)
			case 6:
				return sel([{ id: IDS.TRACK_VERSION_ID }]); // commissionTrackVersions
			case 7:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]); // categoryCommissionConfigVersions (legacy)
			// persistSplits — POS path
			case 8:
				return sel([{ complimentaryReason: null }]); // salesOrders complimentary guard
			case 9:
				return sel([{ id: IDS.SALES_ORDER_ID }]); // salesOrderItems commissionExcluded guard
			case 10:
				return sel([{ role: "trainer", trainerTierId: IDS.TIER_ID_A }]); // members individual resolve
			// applyCommissionCaps
			case 11:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // resolveCategoryIdForSplit
			case 12:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]); // commissionTracks cap config
			default:
				return unmappedSelect(n);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

function buildP2Db(splitResult: unknown[]) {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			// loadCommissionContext — track path (POS conditional threshold)
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // service → categoryId
			case 2:
				return sel([
					{
						id: IDS.TRACK_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
						roleType: "trainer",
						trigger: "on_completion",
					},
				]); // delivery track
			case 3:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
					},
				]); // backing config
			case 4:
				return sel([
					{
						id: IDS.CONDITION_ID,
						configId: IDS.CONFIG_ID,
						conditionIndex: 0,
						operator: "gte",
						threshold: 1,
						thresholdMax: null,
						minQuantity: 3,
					},
				]); // commissionConditions
			case 5:
				return sel([
					{
						trainerTierId: IDS.TIER_ID_A,
						amount: 6000,
						conditionId: IDS.CONDITION_ID,
					},
				]); // commissionConditionRates
			case 6:
				return sel([{ slotIndex: 0, weightageBasisPoints: 10000 }]); // coach slots by trackId (no members batch)
			case 7:
				return sel([{ id: IDS.TRACK_VERSION_ID }]); // commissionTrackVersions
			case 8:
				return sel([{ id: IDS.CONFIG_VERSION_ID }]); // categoryCommissionConfigVersions (legacy)
			// persistSplits — POS path
			case 9:
				return sel([{ complimentaryReason: null }]); // salesOrders complimentary guard
			case 10:
				return sel([{ id: IDS.SALES_ORDER_ID }]); // salesOrderItems commissionExcluded guard
			case 11:
				return sel([{ role: "trainer", trainerTierId: IDS.TIER_ID_A }]); // members individual resolve
			// applyCommissionCaps
			case 12:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // resolveCategoryIdForSplit
			case 13:
				return sel([
					{ maxPerCycleCents: null, excludeIfDiscountAbovePct: null },
				]); // commissionTracks cap config
			default:
				return unmappedSelect(n);
		}
	});
	db.insert.mockImplementation(makeInsertMock(splitResult));
	return db;
}

function buildP3Db() {
	const db = createMockTenantDb();
	let n = 0;
	db.select.mockImplementation(() => {
		n++;
		switch (n) {
			// loadCommissionContext — track path (POS conditional, qty=2 < minQuantity=5 → no match → null)
			case 1:
				return sel([{ categoryId: IDS.CATEGORY_ID }]); // service → categoryId
			case 2:
				return sel([
					{
						id: IDS.TRACK_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
						roleType: "trainer",
						trigger: "on_completion",
					},
				]); // delivery track
			case 3:
				return sel([
					{
						id: IDS.CONFIG_ID,
						categoryId: IDS.CATEGORY_ID,
						paymentType: "fixed",
						isConditional: true,
						isActive: true,
					},
				]); // backing config
			case 4:
				return sel([
					{
						id: IDS.CONDITION_ID,
						configId: IDS.CONFIG_ID,
						conditionIndex: 0,
						operator: "gte",
						threshold: 1,
						thresholdMax: null,
						minQuantity: 5,
					},
				]); // commissionConditions (no match for qty=2 → context returns null → [])
			default:
				return unmappedSelect(n);
		}
	});
	db.insert.mockImplementation(makeInsertMock([]));
	return db;
}

// ---------------------------------------------------------------------------
// Stable split rows (identical shape to the golden fixture)
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
// Golden fixture
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(
	import.meta.dirname,
	"../../fixtures/commission-golden.json",
);

type GoldenFixture = {
	_meta: unknown;
	cases: Record<string, unknown[]>;
};

function loadGolden(): GoldenFixture {
	const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
	return JSON.parse(raw) as GoldenFixture;
}

// ---------------------------------------------------------------------------
// Normalize: dates → ISO strings (matches golden capture normalization)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Diff reporter: produces a clear diff message on mismatch
// ---------------------------------------------------------------------------

function diffReport(
	caseId: string,
	actual: unknown[],
	expected: unknown[],
): string {
	const lines: string[] = [`REGRESSION in case ${caseId}:`];
	lines.push(`  Expected ${expected.length} split(s), got ${actual.length}`);
	if (actual.length > 0 && expected.length > 0) {
		const actualRow = actual[0] as Record<string, unknown>;
		const expectedRow = expected[0] as Record<string, unknown>;
		const allKeys = new Set([
			...Object.keys(actualRow),
			...Object.keys(expectedRow),
		]);
		for (const key of allKeys) {
			if (JSON.stringify(actualRow[key]) !== JSON.stringify(expectedRow[key])) {
				lines.push(
					`  Field "${key}": actual=${JSON.stringify(actualRow[key])}, expected=${JSON.stringify(expectedRow[key])}`,
				);
			}
		}
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Harness tests — one test per corpus case
// ---------------------------------------------------------------------------

describe("Commission Behavior-Diff Harness: new pipeline vs golden fixture", () => {
	const golden = loadGolden();

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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["A1"] ?? [];
		expect(actual, diffReport("A1", actual, expected)).toEqual(expected);
	});

	test("A2 — 2-slot partial pool redistribution, 1 trainer present", async () => {
		const { calculateCommissionForAppointment } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
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
			staffAssignments: [{ staffId: IDS.TRAINER_USER_ID, slotIndex: 0 }],
			actor: IDS.ACTOR,
			earnReason: "completion",
			earnedAt: new Date("2026-01-15T10:00:00.000Z"),
		});

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["A2"] ?? [];
		expect(actual, diffReport("A2", actual, expected)).toEqual(expected);
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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["A3"] ?? [];
		expect(actual, diffReport("A3", actual, expected)).toEqual(expected);
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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["A4"] ?? [];
		expect(actual, diffReport("A4", actual, expected)).toEqual(expected);
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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["A5"] ?? [];
		expect(actual, diffReport("A5", actual, expected)).toEqual(expected);
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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["A6"] ?? [];
		expect(actual, diffReport("A6", actual, expected)).toEqual(expected);
	});

	test("P1 — POS multi-quantity (qty=3), variable rate 10%, no cap", async () => {
		const { calculateCommissionForPos } = await import(
			"@avantej-core/services/commission-calculator.service"
		);
		const expectedSplit = makeSplitRow({
			appointmentId: null,
			salesOrderId: IDS.SALES_ORDER_ID,
			earnReason: "pos_product",
			calculatedAmount: 3000,
			baseAmountCents: 1000,
			weightageBasisPoints: 10000,
			splitPercentage: 10,
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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["P1"] ?? [];
		expect(actual, diffReport("P1", actual, expected)).toEqual(expected);
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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["P2"] ?? [];
		expect(actual, diffReport("P2", actual, expected)).toEqual(expected);
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

		const actual = normalize(splits) as unknown[];
		const expected = golden.cases["P3"] ?? [];
		expect(actual, diffReport("P3", actual, expected)).toEqual(expected);
	});
});
