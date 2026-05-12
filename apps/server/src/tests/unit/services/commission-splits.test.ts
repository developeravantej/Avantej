import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeCommissionSplit } from "../../helpers/fixtures";

import {
	listCommissionSplits,
	getCommissionsByAppointment,
	getMyCommissions,
	liabilitySummary,
	markPaidBatch,
} from "@avantej-core/services/commission-splits.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const MEMBER_ID_2 = "bbbbbbbb-0000-4000-8000-000000000002";
const FROM = "2026-04-01T00:00:00.000Z";
const TO = "2026-04-30T23:59:59.999Z";

function selectChainResolving(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of ["from", "where", "orderBy", "limit", "offset", "leftJoin", "innerJoin", "groupBy", "having"]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

/** Extended mock with execute() for hierarchy CTE usage */
function createMockTenantDbWithExecute(executeResult: unknown = { rows: [] }) {
	const base = createMockTenantDb();
	return {
		...base,
		execute: mock(() => Promise.resolve(executeResult)),
	};
}

/** Minimal mock control-panel db — liabilitySummary does a best-effort name lookup */
function createMockControlPanelDb(users: { id: string; name: string }[] = []) {
	const chain: Record<string, unknown> = {};
	for (const m of ["from", "where"]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(users).then(resolve);
	const db = {
		select: mock(() => chain),
	};
	return db as unknown as Parameters<typeof liabilitySummary>[1];
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listCommissionSplits ────────────────────────────────────────────────────
describe("listCommissionSplits", () => {
	test("returns commission splits from select chain", async () => {
		const splits = [makeCommissionSplit(), makeCommissionSplit()];
		mockDb.select.mockReturnValueOnce(selectChainResolving(splits));

		const result = await listCommissionSplits(mockDb, {});

		expect(result as any).toEqual(splits);
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no splits exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await listCommissionSplits(mockDb, {});

		expect(result).toEqual([]);
	});

	test("filters by memberId (maps to staffId)", async () => {
		const split = makeCommissionSplit({ staffId: MEMBER_ID });
		mockDb.select.mockReturnValueOnce(selectChainResolving([split]));

		const result = await listCommissionSplits(mockDb, { memberId: MEMBER_ID });

		expect(result).toHaveLength(1);
	});
});

// ─── getCommissionsByAppointment ─────────────────────────────────────────────
describe("getCommissionsByAppointment", () => {
	test("returns splits for a specific appointment", async () => {
		const appointmentId = "appt-uuid";
		const splits = [
			makeCommissionSplit({ appointmentId }),
			makeCommissionSplit({ appointmentId }),
		];
		mockDb.select.mockReturnValueOnce(selectChainResolving(splits));

		const result = await getCommissionsByAppointment(mockDb, appointmentId);

		expect(result as any).toEqual(splits);
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no splits for appointment", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getCommissionsByAppointment(mockDb, "no-appt-id");

		expect(result).toEqual([]);
	});
});

// ─── getMyCommissions ────────────────────────────────────────────────────────
describe("getMyCommissions", () => {
	test("returns splits and total amount for a member", async () => {
		const splits = [
			makeCommissionSplit({ staffId: MEMBER_ID, calculatedAmount: 5000 }),
			makeCommissionSplit({ staffId: MEMBER_ID, calculatedAmount: 3000 }),
		];
		mockDb.select.mockReturnValueOnce(selectChainResolving(splits));

		const result = await getMyCommissions(mockDb, MEMBER_ID);

		expect(result.splits as any).toEqual(splits);
		expect(result.totalAmount).toBe(8000);
	});

	test("returns zero totalAmount with empty splits", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getMyCommissions(mockDb, MEMBER_ID);

		expect(result.splits).toEqual([]);
		expect(result.totalAmount).toBe(0);
	});

	test("filters by date range when provided", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await getMyCommissions(mockDb, MEMBER_ID, {
			from: new Date("2026-01-01"),
			to: new Date("2026-01-31"),
		});

		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});
});

// ─── liabilitySummary ────────────────────────────────────────────────────────
describe("liabilitySummary", () => {
	test("returns correct sums per trainer for a known set of aggregated rows", async () => {
		const db = createMockTenantDbWithExecute();
		const cpDb = createMockControlPanelDb([{ id: MEMBER_ID, name: "Alice" }]);

		// The service performs one aggregation SELECT groupBy(staffId)
		db.select.mockReturnValueOnce(
			selectChainResolving([
				{
					staffId: MEMBER_ID,
					approvedUnpaid: 10000,
					paid: 5000,
					manualAdj: 2000,
				},
			]),
		);

		const result = await liabilitySummary(db as any, cpDb, { from: FROM, to: TO });

		expect(result.trainers).toHaveLength(1);
		const trainer = result.trainers[0]!;
		expect(trainer.memberId).toBe(MEMBER_ID);
		expect(trainer.name).toBe("Alice");
		expect(trainer.approvedUnpaidCents).toBe(10000);
		expect(trainer.paidCents).toBe(5000);
		expect(trainer.manualAdjustmentCents).toBe(2000);
		expect(trainer.netPayableCents).toBe(12000); // 10000 + 2000
	});

	test("totals aggregate across all trainers", async () => {
		const db = createMockTenantDbWithExecute();
		const cpDb = createMockControlPanelDb([]);

		db.select.mockReturnValueOnce(
			selectChainResolving([
				{ staffId: MEMBER_ID, approvedUnpaid: 8000, paid: 2000, manualAdj: 500 },
				{ staffId: MEMBER_ID_2, approvedUnpaid: 4000, paid: 1000, manualAdj: -300 },
			]),
		);

		const result = await liabilitySummary(db as any, cpDb, { from: FROM, to: TO });

		expect(result.totals.approvedUnpaidCents).toBe(12000);
		expect(result.totals.paidCents).toBe(3000);
		expect(result.totals.manualAdjustmentCents).toBe(200);
		expect(result.totals.netPayableCents).toBe(12200); // 12000 + 200
	});

	test("returns empty result when no aggregation rows found", async () => {
		const db = createMockTenantDbWithExecute();
		const cpDb = createMockControlPanelDb([]);

		db.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await liabilitySummary(db as any, cpDb, { from: FROM, to: TO });

		expect(result.trainers).toHaveLength(0);
		expect(result.totals.approvedUnpaidCents).toBe(0);
		expect(result.totals.paidCents).toBe(0);
		expect(result.totals.netPayableCents).toBe(0);
	});

	test("filters via earnedAt range — fires one aggregation select", async () => {
		// We verify the query runs (not the WHERE clause internals, which Drizzle builds)
		// The fact that a single select is called confirms date scoping is SQL-side.
		const db = createMockTenantDbWithExecute();
		const cpDb = createMockControlPanelDb([]);

		db.select.mockReturnValueOnce(selectChainResolving([]));

		await liabilitySummary(db as any, cpDb, {
			from: "2026-04-01T00:00:00.000Z",
			to: "2026-04-30T23:59:59.999Z",
		});

		// One aggregation SELECT (no secondary selects for date range — all SQL-side)
		expect(db.select).toHaveBeenCalledTimes(1);
	});

	test("void splits are excluded — approvedUnpaid sum is zero when only void rows", async () => {
		// The aggregation query has WHERE status != 'void' baked in.
		// If the DB returns zero rows (because all were void), result is empty.
		const db = createMockTenantDbWithExecute();
		const cpDb = createMockControlPanelDb([]);

		// Simulate DB returning nothing (void rows filtered out at DB level)
		db.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await liabilitySummary(db as any, cpDb, { from: FROM, to: TO });

		expect(result.trainers).toHaveLength(0);
		expect(result.totals.approvedUnpaidCents).toBe(0);
	});

	test("falls back to staffId as name when control panel lookup fails", async () => {
		const db = createMockTenantDbWithExecute();
		// Empty control-panel — no user names returned
		const cpDb = createMockControlPanelDb([]);

		db.select.mockReturnValueOnce(
			selectChainResolving([
				{ staffId: MEMBER_ID, approvedUnpaid: 1000, paid: 0, manualAdj: 0 },
			]),
		);

		const result = await liabilitySummary(db as any, cpDb, { from: FROM, to: TO });

		expect(result.trainers[0]!.name).toBe(MEMBER_ID);
	});

	test("hierarchyNodeId scopes to members within descendant nodes", async () => {
		const NODE_ID = "cccccccc-0000-4000-8000-000000000001";
		const db = createMockTenantDbWithExecute({ rows: [{ id: NODE_ID }] });
		const cpDb = createMockControlPanelDb([]);

		// 1st select: fetch scoped members (hierarchyScopeId IN descendants)
		db.select.mockReturnValueOnce(
			selectChainResolving([{ userId: MEMBER_ID }]),
		);
		// 2nd select: aggregation query
		db.select.mockReturnValueOnce(
			selectChainResolving([
				{ staffId: MEMBER_ID, approvedUnpaid: 3000, paid: 0, manualAdj: 0 },
			]),
		);

		const result = await liabilitySummary(db as any, cpDb, {
			from: FROM,
			to: TO,
			hierarchyNodeId: NODE_ID,
		});

		expect(result.trainers).toHaveLength(1);
		expect(result.trainers[0]!.memberId).toBe(MEMBER_ID);
		// execute called once for hierarchy CTE
		expect(db.execute).toHaveBeenCalledTimes(1);
	});

	test("hierarchyNodeId returns empty when no members in scope", async () => {
		const NODE_ID = "cccccccc-0000-4000-8000-000000000001";
		const db = createMockTenantDbWithExecute({ rows: [{ id: NODE_ID }] });
		const cpDb = createMockControlPanelDb([]);

		// Members select returns empty — no staff in this node
		db.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await liabilitySummary(db as any, cpDb, {
			from: FROM,
			to: TO,
			hierarchyNodeId: NODE_ID,
		});

		expect(result.trainers).toHaveLength(0);
		// Aggregation select should NOT be called (short-circuit after empty members)
		expect(db.select).toHaveBeenCalledTimes(1);
	});
});

// ─── markPaidBatch ───────────────────────────────────────────────────────────
describe("markPaidBatch", () => {
	const actor = {
		userId: "user-actor",
		memberId: "member-actor",
		role: "admin",
	};

	test("updates approved splits in range and returns count + affected memberIds", async () => {
		const db = createMockTenantDbWithExecute();

		// The transaction mock calls the callback with a nested mockDb
		// We need to intercept the update inside the transaction.
		const updatedRows = [
			{ staffId: MEMBER_ID, id: "split-1" },
			{ staffId: MEMBER_ID, id: "split-2" },
			{ staffId: MEMBER_ID_2, id: "split-3" },
		];

		const innerDb = {
			...createMockTenantDb(),
			execute: mock(() => Promise.resolve({ rows: [] })),
		};

		// update chain: .set().where().returning()
		const returningMock = mock(() => Promise.resolve(updatedRows));
		const whereMock = mock(() => ({ returning: returningMock }));
		const setMock = mock(() => ({ where: whereMock }));
		innerDb.update = mock(() => ({ set: setMock })) as any;
		// audit write inside transaction uses insert
		innerDb.insert = mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([{ id: "audit-1" }])) })) })) as any;

		db.transaction = mock((cb: (tx: unknown) => Promise<unknown>) => cb(innerDb)) as any;

		const result = await markPaidBatch(db as any, {
			memberIds: [MEMBER_ID, MEMBER_ID_2],
			from: FROM,
			to: TO,
			actor,
		});

		expect(result.updatedCount).toBe(3);
		expect(result.memberIds).toHaveLength(2);
		expect(result.memberIds).toContain(MEMBER_ID);
		expect(result.memberIds).toContain(MEMBER_ID_2);
	});

	test("returns empty when no approved splits in range", async () => {
		const db = createMockTenantDbWithExecute();

		const innerDb = {
			...createMockTenantDb(),
			execute: mock(() => Promise.resolve({ rows: [] })),
		};
		const returningMock = mock(() => Promise.resolve([]));
		const whereMock = mock(() => ({ returning: returningMock }));
		const setMock = mock(() => ({ where: whereMock }));
		innerDb.update = mock(() => ({ set: setMock })) as any;
		innerDb.insert = mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([{ id: "audit-1" }])) })) })) as any;

		db.transaction = mock((cb: (tx: unknown) => Promise<unknown>) => cb(innerDb)) as any;

		const result = await markPaidBatch(db as any, {
			memberIds: [MEMBER_ID],
			from: FROM,
			to: TO,
			actor,
		});

		expect(result.updatedCount).toBe(0);
		expect(result.memberIds).toHaveLength(0);
	});

	test("skips pending, void, and already-paid splits (only targets approved)", async () => {
		// The WHERE clause in the UPDATE is status='approved'.
		// Simulate DB returning only the approved ones (others excluded by DB).
		const db = createMockTenantDbWithExecute();

		const innerDb = {
			...createMockTenantDb(),
			execute: mock(() => Promise.resolve({ rows: [] })),
		};
		// Only 1 approved split returned (2 pending/paid/void were excluded by DB)
		const returningMock = mock(() => Promise.resolve([{ staffId: MEMBER_ID, id: "split-approved" }]));
		const whereMock = mock(() => ({ returning: returningMock }));
		const setMock = mock(() => ({ where: whereMock }));
		innerDb.update = mock(() => ({ set: setMock })) as any;
		innerDb.insert = mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([{ id: "audit-1" }])) })) })) as any;

		db.transaction = mock((cb: (tx: unknown) => Promise<unknown>) => cb(innerDb)) as any;

		const result = await markPaidBatch(db as any, {
			memberIds: [MEMBER_ID],
			from: FROM,
			to: TO,
			actor,
		});

		// Only 1 updated (the approved one)
		expect(result.updatedCount).toBe(1);
		expect(result.memberIds).toEqual([MEMBER_ID]);
	});

	test("is wrapped in a transaction — uses transaction callback", async () => {
		const db = createMockTenantDbWithExecute();

		const innerDb = {
			...createMockTenantDb(),
			execute: mock(() => Promise.resolve({ rows: [] })),
		};
		innerDb.update = mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ returning: mock(() => Promise.resolve([])) })),
			})),
		})) as any;
		innerDb.insert = mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([{ id: "audit-1" }])) })) })) as any;

		const txMock = mock((cb: (tx: unknown) => Promise<unknown>) => cb(innerDb));
		db.transaction = txMock as any;

		await markPaidBatch(db as any, {
			memberIds: [MEMBER_ID],
			from: FROM,
			to: TO,
			actor,
		});

		// Transaction was called exactly once
		expect(txMock).toHaveBeenCalledTimes(1);
	});

	test("audit is written once per affected member (not per split)", async () => {
		const db = createMockTenantDbWithExecute();

		// 3 splits for MEMBER_ID, 2 for MEMBER_ID_2 → should audit 2 times
		const updatedRows = [
			{ staffId: MEMBER_ID, id: "s1" },
			{ staffId: MEMBER_ID, id: "s2" },
			{ staffId: MEMBER_ID, id: "s3" },
			{ staffId: MEMBER_ID_2, id: "s4" },
			{ staffId: MEMBER_ID_2, id: "s5" },
		];

		const innerDb = {
			...createMockTenantDb(),
			execute: mock(() => Promise.resolve({ rows: [] })),
		};
		innerDb.update = mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ returning: mock(() => Promise.resolve(updatedRows)) })),
			})),
		})) as any;

		const auditReturning = mock(() => Promise.resolve([{ id: "audit-row" }]));
		const auditValues = mock(() => ({ returning: auditReturning }));
		const auditInsert = mock(() => ({ values: auditValues }));
		innerDb.insert = auditInsert as any;

		db.transaction = mock((cb: (tx: unknown) => Promise<unknown>) => cb(innerDb)) as any;

		await markPaidBatch(db as any, {
			memberIds: [MEMBER_ID, MEMBER_ID_2],
			from: FROM,
			to: TO,
			actor,
		});

		// audit_logs insert called twice (once per distinct memberId)
		expect(auditInsert).toHaveBeenCalledTimes(2);
	});
});
