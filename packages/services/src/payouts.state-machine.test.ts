/**
 * Unit tests for the payout state machine in `payouts.service.ts`.
 *
 * Payouts move money to trainers, so the transition guards and the linked
 * commission_split side-effects are correctness-critical. These were only
 * exercised indirectly via e2e journeys before; this file pins the matrix
 * directly against a mock transaction (no live DB):
 *
 *   markPayoutPaid    pending | processing → paid      (flips approved splits → paid)
 *   markPayoutFailed  pending | processing → failed    (splits untouched)
 *   retryPayout       failed              → pending    (splits untouched)
 *   cancelPayout      pending | failed    → canceled   (splits → approved, payoutId cleared)
 *
 * No `mock.module` is used — `writeAudit` writes via `tx.insert(...).values()`,
 * which the mock tx satisfies — so we avoid the process-global mock hazard.
 */

import { describe, expect, it } from "bun:test";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import {
	cancelPayout,
	markPayoutFailed,
	markPayoutPaid,
	retryPayout,
} from "./payouts.service";

type PayoutStatus = "pending" | "processing" | "paid" | "failed" | "canceled";

interface MockResult {
	tenantDb: never;
	/** `.set()` payloads captured per table, in call order. */
	payoutSets: Record<string, unknown>[];
	splitSets: Record<string, unknown>[];
	splitWhereCount: number;
	auditValues: Record<string, unknown>[];
}

/**
 * Build a mock TenantDb whose `transaction(cb)` runs `cb(tx)` against a tx that
 * satisfies exactly the surface the transition functions touch:
 *   - select(...).from(...).where(...).for("update").limit(1)  -> [row] | []
 *   - update(table).set(obj).where(...)                        -> awaitable + .returning()
 *   - insert(...).values(obj)                                  -> awaitable (writeAudit)
 */
function makeMockDb(
	row: { id: string; status: PayoutStatus } | null,
): MockResult {
	const payoutSets: Record<string, unknown>[] = [];
	const splitSets: Record<string, unknown>[] = [];
	const auditValues: Record<string, unknown>[] = [];
	let splitWhereCount = 0;

	const updatedRow = row ? { ...row } : null;

	const selectChain: Record<string, unknown> = {
		from: () => selectChain,
		where: () => selectChain,
		for: () => selectChain,
		limit: () => Promise.resolve(row ? [row] : []),
		// A select awaited AT `.where()` (no `.limit()`) — e.g. cancelPayout's
		// linkedSplits period-lock probe — resolves to an empty set. The bulk
		// split-revert still runs via update(commissionSplits), so splitSets is
		// unaffected; the payout-fetch path keeps resolving through `.limit()`.
		then: (resolve: (v: unknown) => unknown) =>
			Promise.resolve([]).then(resolve),
	};

	const tx = {
		select: () => selectChain,
		update: (table: unknown) => ({
			set: (setArg: Record<string, unknown>) => {
				const isPayouts = table === payouts;
				if (isPayouts) payoutSets.push(setArg);
				else if (table === commissionSplits) splitSets.push(setArg);
				// `.where()` must be BOTH awaitable (split path, no .returning) and
				// chainable to `.returning()` (payout path).
				const whereResult = {
					returning: () =>
						Promise.resolve(isPayouts && updatedRow ? [{ ...updatedRow }] : []),
					then: (
						resolve: (v: unknown) => unknown,
						reject?: (e: unknown) => unknown,
					) => {
						if (!isPayouts) splitWhereCount += 1;
						return Promise.resolve(undefined).then(resolve, reject);
					},
				};
				return { where: () => whereResult };
			},
		}),
		insert: () => ({
			values: (v: Record<string, unknown>) => {
				auditValues.push(v);
				return Promise.resolve();
			},
		}),
	};

	const tenantDb = {
		transaction: (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
	} as unknown as never;

	return {
		tenantDb,
		payoutSets,
		splitSets,
		get splitWhereCount() {
			return splitWhereCount;
		},
		auditValues,
	};
}

const ACTOR = { userId: "user-1", memberId: "member-1", role: "admin" };

// ---------------------------------------------------------------------------
// markPayoutPaid — pending|processing → paid
// ---------------------------------------------------------------------------

describe("markPayoutPaid", () => {
	it("transitions a pending payout to paid", async () => {
		const m = makeMockDb({ id: "p1", status: "pending" });
		const updated = await markPayoutPaid(m.tenantDb, "p1", {
			paymentReference: "WIRE-123",
			actor: ACTOR,
		});
		expect(updated).toBeDefined();
		expect(m.payoutSets[0]?.status).toBe("paid");
	});

	it("transitions a processing payout to paid", async () => {
		const m = makeMockDb({ id: "p1", status: "processing" });
		await markPayoutPaid(m.tenantDb, "p1", {
			paymentReference: "WIRE-123",
			actor: ACTOR,
		});
		expect(m.payoutSets[0]?.status).toBe("paid");
	});

	it("flips linked approved splits to paid", async () => {
		const m = makeMockDb({ id: "p1", status: "pending" });
		await markPayoutPaid(m.tenantDb, "p1", {
			paymentReference: "WIRE-123",
			actor: ACTOR,
		});
		expect(m.splitSets[0]?.status).toBe("paid");
		expect(m.splitSets[0]?.paidBy).toBe(ACTOR.userId);
	});

	it("records the payment reference in the audit changes", async () => {
		const m = makeMockDb({ id: "p1", status: "pending" });
		await markPayoutPaid(m.tenantDb, "p1", {
			paymentReference: "WIRE-123",
			actor: ACTOR,
		});
		const audit = m.auditValues[0];
		expect(audit?.action).toBe("payout.mark_paid");
		expect((audit?.changes as Record<string, unknown>)?.paymentReference).toBe(
			"WIRE-123",
		);
	});

	it.each([
		"paid",
		"failed",
		"canceled",
	] as PayoutStatus[])("rejects marking a %s payout as paid (BAD_REQUEST)", async (status) => {
		const m = makeMockDb({ id: "p1", status });
		let caught: unknown;
		try {
			await markPayoutPaid(m.tenantDb, "p1", {
				paymentReference: "WIRE-123",
				actor: ACTOR,
			});
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("BAD_REQUEST");
		// No mutation should have occurred on an illegal transition.
		expect(m.payoutSets).toHaveLength(0);
		expect(m.splitSets).toHaveLength(0);
	});

	it("throws NOT_FOUND when the payout does not exist", async () => {
		const m = makeMockDb(null);
		let caught: unknown;
		try {
			await markPayoutPaid(m.tenantDb, "missing", {
				paymentReference: "x",
				actor: ACTOR,
			});
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("NOT_FOUND");
	});
});

// ---------------------------------------------------------------------------
// markPayoutFailed — pending|processing → failed
// ---------------------------------------------------------------------------

describe("markPayoutFailed", () => {
	it.each([
		"pending",
		"processing",
	] as PayoutStatus[])("transitions a %s payout to failed and leaves splits untouched", async (status) => {
		const m = makeMockDb({ id: "p1", status });
		await markPayoutFailed(m.tenantDb, "p1", {
			reason: "bank rejected",
			actor: ACTOR,
		});
		expect(m.payoutSets[0]?.status).toBe("failed");
		// Splits must stay 'approved' so a follow-up retry keeps the linkage.
		expect(m.splitSets).toHaveLength(0);
	});

	it.each([
		"paid",
		"failed",
		"canceled",
	] as PayoutStatus[])("rejects failing a %s payout (BAD_REQUEST)", async (status) => {
		const m = makeMockDb({ id: "p1", status });
		let caught: unknown;
		try {
			await markPayoutFailed(m.tenantDb, "p1", {
				reason: "x",
				actor: ACTOR,
			});
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("BAD_REQUEST");
		expect(m.payoutSets).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// retryPayout — failed → pending
// ---------------------------------------------------------------------------

describe("retryPayout", () => {
	it("resets a failed payout to pending and clears paidAt", async () => {
		const m = makeMockDb({ id: "p1", status: "failed" });
		await retryPayout(m.tenantDb, "p1", { actor: ACTOR });
		expect(m.payoutSets[0]?.status).toBe("pending");
		expect(m.payoutSets[0]?.paidAt).toBeNull();
		expect(m.splitSets).toHaveLength(0);
	});

	it.each([
		"pending",
		"processing",
		"paid",
		"canceled",
	] as PayoutStatus[])("rejects retrying a %s payout (only failed is retryable)", async (status) => {
		const m = makeMockDb({ id: "p1", status });
		let caught: unknown;
		try {
			await retryPayout(m.tenantDb, "p1", { actor: ACTOR });
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("BAD_REQUEST");
		expect(m.payoutSets).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// cancelPayout — pending|failed → canceled
// ---------------------------------------------------------------------------

describe("cancelPayout", () => {
	it.each([
		"pending",
		"failed",
	] as PayoutStatus[])("cancels a %s payout and reverts linked splits to approved with payoutId cleared", async (status) => {
		const m = makeMockDb({ id: "p1", status });
		await cancelPayout(m.tenantDb, "p1", {
			reason: "recipient terminated",
			actor: ACTOR,
		});
		expect(m.payoutSets[0]?.status).toBe("canceled");
		// Money-correctness invariant: splits become re-batchable.
		expect(m.splitSets[0]?.status).toBe("approved");
		expect(m.splitSets[0]?.payoutId).toBeNull();
		expect(m.splitSets[0]?.paidAt).toBeNull();
	});

	it("refuses to cancel a paid payout (clawback flow required instead)", async () => {
		const m = makeMockDb({ id: "p1", status: "paid" });
		let caught: unknown;
		try {
			await cancelPayout(m.tenantDb, "p1", { reason: "x", actor: ACTOR });
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("BAD_REQUEST");
		expect(m.payoutSets).toHaveLength(0);
		expect(m.splitSets).toHaveLength(0);
	});

	it("rejects cancelling a processing or already-canceled payout", async () => {
		for (const status of ["processing", "canceled"] as PayoutStatus[]) {
			const m = makeMockDb({ id: "p1", status });
			let caught: unknown;
			try {
				await cancelPayout(m.tenantDb, "p1", { reason: "x", actor: ACTOR });
			} catch (e) {
				caught = e;
			}
			expect((caught as { code?: string })?.code).toBe("BAD_REQUEST");
		}
	});
});
