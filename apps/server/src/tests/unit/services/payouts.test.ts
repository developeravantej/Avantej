/**
 * Unit tests for payouts.service.ts
 *
 * Covers:
 *  - recipientSummary (1.27): aggregates lifetime stats for a recipient
 *  - processForRecipient (1.28): delegates to runBatch scoped to one recipient
 *  - runBatch / processCommissionReversals (1.29): grossAmountCents + deductionsCents populated
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import {
	recipientSummary,
	runBatch,
	processForRecipient,
	processCommissionReversals,
} from "@avantej-core/services/payouts.service";

const RECIPIENT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const STAFF_ID_2 = "aaaaaaaa-0000-4000-8000-000000000002";
const USER_ID = "uuuuuuuu-0000-4000-8000-000000000001";

let mockDb: ReturnType<typeof createMockTenantDb>;

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------

function selectChainResolving(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of [
		"from", "where", "orderBy", "limit", "offset",
		"leftJoin", "innerJoin", "groupBy", "having",
	]) {
		chain[m] = mock(() => chain);
	}
	// for("update") is used by runBatch's SELECT FOR UPDATE
	chain.for = mock(() => Promise.resolve(value));
	// as() wraps the chain into a named subquery; return chain so .from(subquery) still works
	chain.as = mock((_alias: string) => chain);
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

function txMockWith(behavior: (tx: ReturnType<typeof createMockTenantDb>) => void) {
	return mock((cb: (tx: unknown) => Promise<unknown>) => {
		const tx = createMockTenantDb();
		behavior(tx);
		return cb(tx);
	});
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ---------------------------------------------------------------------------
// 1.27 — recipientSummary
// ---------------------------------------------------------------------------

// recipientSummary makes 3 sequential select() calls:
//   1. Inner subquery: select({amount}).from(payouts).where(...).orderBy(...).limit(100)  → .as("recent_paid")
//   2. Outer avg:      select({avgCents:avg(...)}).from(recentSubquery)
//   3. Totals:         select({lifetimePaidCents, lastPayoutAt}).from(payouts).where(...)
//
// Call 1 resolves but its value is ignored (it becomes the subquery object passed to call 2's .from()).
// Call 2 resolves to [{avgCents}].
// Call 3 resolves to [{lifetimePaidCents, lastPayoutAt}].

describe("recipientSummary", () => {
	test("returns zeroes when no paid payouts exist", async () => {
		mockDb.select
			.mockReturnValueOnce(selectChainResolving([])) // subquery (value unused)
			.mockReturnValueOnce(selectChainResolving([{ avgCents: null }]))  // avg
			.mockReturnValueOnce(selectChainResolving([{ lifetimePaidCents: 0, lastPayoutAt: null }])); // totals

		const result = await recipientSummary(mockDb as any, {
			recipientId: RECIPIENT_ID,
			accessibleNodeIds: [],
			callerIsAdmin: true,
		} as any);

		expect(result.lifetimePaidCents).toBe(0);
		expect(result.avgPerCycleCents).toBe(0);
		expect(result.lastPayoutAt).toBeNull();
	});

	test("computes correct aggregates from mock data", async () => {
		const lastPaid = new Date("2026-04-01T10:00:00Z");

		mockDb.select
			.mockReturnValueOnce(selectChainResolving([])) // subquery
			.mockReturnValueOnce(selectChainResolving([{ avgCents: "4500" }])) // avg
			.mockReturnValueOnce(selectChainResolving([{ lifetimePaidCents: 90000, lastPayoutAt: lastPaid }])); // totals

		const result = await recipientSummary(mockDb as any, {
			recipientId: RECIPIENT_ID,
			accessibleNodeIds: [],
			callerIsAdmin: true,
		} as any);

		expect(result.lifetimePaidCents).toBe(90000);
		expect(result.avgPerCycleCents).toBe(4500);
		expect(result.lastPayoutAt).toEqual(lastPaid);
	});

	test("rounds fractional avgCents", async () => {
		mockDb.select
			.mockReturnValueOnce(selectChainResolving([])) // subquery
			.mockReturnValueOnce(selectChainResolving([{ avgCents: "3333.33" }])) // avg
			.mockReturnValueOnce(selectChainResolving([{ lifetimePaidCents: 10000, lastPayoutAt: null }])); // totals

		const result = await recipientSummary(mockDb as any, {
			recipientId: RECIPIENT_ID,
			accessibleNodeIds: [],
			callerIsAdmin: true,
		} as any);

		expect(result.avgPerCycleCents).toBe(3333);
	});

	test("handles empty rows gracefully", async () => {
		mockDb.select
			.mockReturnValueOnce(selectChainResolving([])) // subquery
			.mockReturnValueOnce(selectChainResolving([])) // avg — no row
			.mockReturnValueOnce(selectChainResolving([])); // totals — no row

		const result = await recipientSummary(mockDb as any, {
			recipientId: RECIPIENT_ID,
			accessibleNodeIds: [],
			callerIsAdmin: true,
		} as any);

		expect(result.lifetimePaidCents).toBe(0);
		expect(result.avgPerCycleCents).toBe(0);
		expect(result.lastPayoutAt).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 1.28 — processForRecipient
// ---------------------------------------------------------------------------

describe("processForRecipient", () => {
	const baseParams = {
		recipientId: RECIPIENT_ID,
		periodStart: new Date("2026-04-01"),
		periodEnd: new Date("2026-04-30"),
		paymentMethod: "cash" as const,
		paidByUserId: USER_ID,
	};

	test("throws EMPTY_BATCH when no splits found", async () => {
		// transaction calls runBatch internally; tx.select returns empty locked set
		mockDb.transaction = txMockWith((tx) => {
			tx.select.mockReturnValueOnce(selectChainResolving([]));
		});

		await expect(
			processForRecipient(mockDb as any, baseParams),
		).rejects.toMatchObject({ code: "EMPTY_BATCH" });
	});

	test("inserts payout with grossAmountCents = totalCents and deductionsCents = 0", async () => {
		const splits = [
			{ id: "split-1", staffId: RECIPIENT_ID, calculatedAmount: 5000 },
			{ id: "split-2", staffId: RECIPIENT_ID, calculatedAmount: 3000 },
		];

		let insertedValues: Record<string, unknown> | null = null;

		mockDb.transaction = txMockWith((tx) => {
			// SELECT FOR UPDATE: .for() resolves to the splits array
			tx.select.mockReturnValueOnce(selectChainResolving(splits));

			// INSERT capturing the values
			tx.insert = mock(() => ({
				values: mock((vals: Record<string, unknown>) => {
					insertedValues = vals;
					return { returning: mock(() => Promise.resolve([{ id: "payout-1" }])) };
				}),
			}));

			// UPDATE for splits
			tx.update = mock(() => ({
				set: mock(() => ({
					where: mock(() => Promise.resolve([])),
				})),
			}));
		});

		const result = await processForRecipient(mockDb as any, baseParams);

		expect(result.payoutIds).toEqual(["payout-1"]);
		expect(result.totalAmountCents).toBe(8000);
		expect(result.splitCount).toBe(2);
		expect(insertedValues).not.toBeNull();
		expect(insertedValues!.grossAmountCents).toBe(8000);
		expect(insertedValues!.deductionsCents).toBe(0);
		expect(insertedValues!.amount).toBe(8000);
	});

	test("passes reference through to payout description", async () => {
		const splits = [{ id: "split-3", staffId: RECIPIENT_ID, calculatedAmount: 2000 }];
		let insertedValues: Record<string, unknown> | null = null;

		mockDb.transaction = txMockWith((tx) => {
			tx.select.mockReturnValueOnce(selectChainResolving(splits));
			tx.insert = mock(() => ({
				values: mock((vals: Record<string, unknown>) => {
					insertedValues = vals;
					return { returning: mock(() => Promise.resolve([{ id: "payout-ref" }])) };
				}),
			}));
			tx.update = mock(() => ({
				set: mock(() => ({ where: mock(() => Promise.resolve([])) })),
			}));
		});

		await processForRecipient(mockDb as any, {
			...baseParams,
			reference: "REF-2026-001",
		});

		expect(insertedValues!.description).toBe("REF-2026-001");
		expect((insertedValues!.notes as string).includes("REF-2026-001")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 1.29 — runBatch populates gross/deductions
// ---------------------------------------------------------------------------

describe("runBatch — grossAmountCents population", () => {
	const baseParams = {
		staffIds: [RECIPIENT_ID, STAFF_ID_2],
		periodStart: new Date("2026-04-01"),
		periodEnd: new Date("2026-04-30"),
		paymentMethod: "bank_transfer" as const,
		paidByUserId: USER_ID,
	};

	test("sets grossAmountCents = amount and deductionsCents = 0 for each staff row", async () => {
		const splits = [
			{ id: "s1", staffId: RECIPIENT_ID, calculatedAmount: 10000 },
			{ id: "s2", staffId: STAFF_ID_2, calculatedAmount: 6000 },
		];

		const insertedRows: Record<string, unknown>[] = [];

		mockDb.transaction = txMockWith((tx) => {
			tx.select.mockReturnValueOnce(selectChainResolving(splits));
			tx.insert = mock(() => ({
				values: mock((vals: Record<string, unknown>) => {
					insertedRows.push(vals);
					const payoutId = `payout-${insertedRows.length}`;
					return {
						returning: mock(() => Promise.resolve([{ id: payoutId }])),
					};
				}),
			}));
			tx.update = mock(() => ({
				set: mock(() => ({ where: mock(() => Promise.resolve([])) })),
			}));
		});

		const result = await runBatch(mockDb as any, baseParams);

		expect(result.payoutIds).toHaveLength(2);
		expect(result.splitCount).toBe(2);

		for (const row of insertedRows) {
			expect(row.deductionsCents).toBe(0);
			expect(row.grossAmountCents).toBe(row.amount);
		}
	});
});

// ---------------------------------------------------------------------------
// 1.29 — processCommissionReversals populates gross/deductions
// ---------------------------------------------------------------------------

describe("processCommissionReversals — grossAmountCents population", () => {
	test("inserts negative payout with grossAmountCents = negative amount and deductionsCents = 0", async () => {
		const pendingReversals = [
			{ reversalId: "rev-1", reversedSplitId: "split-1", amountCents: 3000, staffId: RECIPIENT_ID },
		];

		let insertedValues: Record<string, unknown> | null = null;

		mockDb.select.mockReturnValueOnce(selectChainResolving(pendingReversals));

		mockDb.transaction = txMockWith((tx) => {
			tx.insert = mock(() => ({
				values: mock((vals: Record<string, unknown>) => {
					insertedValues = vals;
					return { returning: mock(() => Promise.resolve([{ id: "adj-payout-1" }])) };
				}),
			}));
			tx.update = mock(() => ({
				set: mock(() => ({ where: mock(() => Promise.resolve([])) })),
			}));
		});

		const result = await processCommissionReversals(mockDb as any, {
			userId: USER_ID,
			memberId: "member-1",
		});

		expect(result.processedCount).toBe(1);
		expect(result.payoutIds).toEqual(["adj-payout-1"]);
		expect(insertedValues).not.toBeNull();
		expect(insertedValues!.amount).toBe(-3000);
		expect(insertedValues!.grossAmountCents).toBe(-3000);
		expect(insertedValues!.deductionsCents).toBe(0);
	});

	test("returns empty result when no pending reversals", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await processCommissionReversals(mockDb as any, {
			userId: USER_ID,
			memberId: "member-1",
		});

		expect(result.processedCount).toBe(0);
		expect(result.payoutIds).toHaveLength(0);
		expect(mockDb.transaction).not.toHaveBeenCalled();
	});
});
