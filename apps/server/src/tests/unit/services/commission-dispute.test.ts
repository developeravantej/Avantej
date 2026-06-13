import { describe, test, expect } from "bun:test";

import {
	contestCommissionSplit,
	resolveDispute,
} from "@avantej-core/services/commission-splits.service";

// ─── Mock tx/db factory ──────────────────────────────────────────────────────
//
// Both functions run entirely inside tenantDb.transaction(cb). The tx exposes:
//   select().from().where().for("update")  → resolves the locked row
//   update().set(payload).where().returning() → resolves the updated row
//   insert().values(row)[.returning()]     → writeAudit awaits values() directly;
//                                              the adjust path uses .returning()
// We capture every .set() payload and insert .values() row so tests can assert
// exactly what the service WROTE (the mock does not apply the SET itself).

const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const OTHER_USER = "bbbbbbbb-0000-4000-8000-000000000002";
const ACTOR = { userId: "actor-user", memberId: "actor-member", role: "admin" };

function makeTx(opts: {
	selectRow: unknown[];
	updateReturn?: unknown[];
	insertReturn?: unknown[];
}) {
	const setCalls: any[] = [];
	const insertedValues: any[] = [];
	const updateReturn = opts.updateReturn ?? [{ id: "updated" }];
	const insertReturn = opts.insertReturn ?? [{ id: "new-split" }];

	const tx = {
		select: () => {
			const chain: any = {};
			chain.from = () => chain;
			chain.where = () => chain;
			chain.for = () => Promise.resolve(opts.selectRow);
			return chain;
		},
		update: () => ({
			set: (payload: any) => {
				setCalls.push(payload);
				return {
					where: () => ({ returning: () => Promise.resolve(updateReturn) }),
				};
			},
		}),
		insert: () => ({
			values: (row: any) => {
				insertedValues.push(row);
				const r: any = { returning: () => Promise.resolve(insertReturn) };
				// writeAudit does `await db.insert(...).values(...)` with no .returning()
				r.then = (resolve: (v: unknown) => unknown) =>
					Promise.resolve(undefined).then(resolve);
				return r;
			},
		}),
		__setCalls: setCalls,
		__insertedValues: insertedValues,
	};
	return tx;
}

function makeDb(tx: ReturnType<typeof makeTx>) {
	return {
		transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx),
	} as any;
}

// ─── contestCommissionSplit ──────────────────────────────────────────────────

describe("contestCommissionSplit", () => {
	test("remembers the prior status in contested_from_status (pending → contested)", async () => {
		const tx = makeTx({
			selectRow: [{ id: "s1", staffId: MEMBER_ID, status: "pending" }],
		});
		await contestCommissionSplit(makeDb(tx), {
			splitId: "s1",
			contestedBy: MEMBER_ID,
			category: "wrong_amount",
			reason: "off by RM10",
			actor: ACTOR,
		});

		const setPayload = tx.__setCalls[0];
		expect(setPayload.status).toBe("contested");
		expect(setPayload.contestedFromStatus).toBe("pending");
		expect(setPayload.contestedBy).toBe(MEMBER_ID);
		expect(setPayload.contestedCategory).toBe("wrong_amount");
	});

	test("an approved split records contested_from_status='approved'", async () => {
		const tx = makeTx({
			selectRow: [{ id: "s2", staffId: MEMBER_ID, status: "approved" }],
		});
		await contestCommissionSplit(makeDb(tx), {
			splitId: "s2",
			contestedBy: MEMBER_ID,
			category: "should_not_earn",
			reason: "session was cancelled",
			actor: ACTOR,
		});
		expect(tx.__setCalls[0].contestedFromStatus).toBe("approved");
	});

	test("rejects when the caller is not the earner (ownership)", async () => {
		const tx = makeTx({
			selectRow: [{ id: "s3", staffId: MEMBER_ID, status: "pending" }],
		});
		await expect(
			contestCommissionSplit(makeDb(tx), {
				splitId: "s3",
				contestedBy: OTHER_USER, // not the staffId on the split
				category: "other",
				reason: "x",
				actor: ACTOR,
			}),
		).rejects.toThrow(/only dispute your own/i);
		expect(tx.__setCalls).toHaveLength(0);
	});

	test("rejects a paid split (money already moved → refund path, not dispute)", async () => {
		const tx = makeTx({
			selectRow: [{ id: "s4", staffId: MEMBER_ID, status: "paid" }],
		});
		await expect(
			contestCommissionSplit(makeDb(tx), {
				splitId: "s4",
				contestedBy: MEMBER_ID,
				category: "wrong_amount",
				reason: "x",
				actor: ACTOR,
			}),
		).rejects.toThrow(/cannot dispute/i);
		expect(tx.__setCalls).toHaveLength(0);
	});

	test("rejects when the split does not exist", async () => {
		const tx = makeTx({ selectRow: [] });
		await expect(
			contestCommissionSplit(makeDb(tx), {
				splitId: "missing",
				contestedBy: MEMBER_ID,
				category: "other",
				reason: "x",
				actor: ACTOR,
			}),
		).rejects.toThrow(/not found/i);
	});
});

// ─── resolveDispute ──────────────────────────────────────────────────────────

describe("resolveDispute", () => {
	test("uphold restores the EXACT prior status from contested_from_status", async () => {
		const tx = makeTx({
			selectRow: [
				{
					id: "s5",
					staffId: MEMBER_ID,
					status: "contested",
					contestedFromStatus: "approved",
				},
			],
		});
		await resolveDispute(makeDb(tx), {
			splitId: "s5",
			action: "uphold",
			note: "looks correct",
			actor: ACTOR,
		});
		// The restored status must equal what was remembered at contest time.
		expect(tx.__setCalls[0].status).toBe("approved");
		expect(tx.__setCalls[0].resolvedBy).toBe(ACTOR.userId);
	});

	test("uphold falls back to 'pending' when no prior status was stored", async () => {
		const tx = makeTx({
			selectRow: [
				{
					id: "s6",
					staffId: MEMBER_ID,
					status: "contested",
					contestedFromStatus: null,
				},
			],
		});
		await resolveDispute(makeDb(tx), {
			splitId: "s6",
			action: "uphold",
			note: null,
			actor: ACTOR,
		});
		expect(tx.__setCalls[0].status).toBe("pending");
	});

	test("void sets status='void' and creates no adjustment", async () => {
		const tx = makeTx({
			selectRow: [
				{
					id: "s7",
					staffId: MEMBER_ID,
					status: "contested",
					contestedFromStatus: "pending",
				},
			],
		});
		const result = await resolveDispute(makeDb(tx), {
			splitId: "s7",
			action: "void",
			note: "not earned",
			actor: ACTOR,
		});
		expect(tx.__setCalls[0].status).toBe("void");
		expect(result.adjustment).toBeNull();
	});

	test("adjust voids the contested split AND inserts a corrected manual split", async () => {
		const tx = makeTx({
			selectRow: [
				{
					id: "s8",
					staffId: MEMBER_ID,
					status: "contested",
					contestedFromStatus: "approved",
					appointmentId: "appt-1",
					salesOrderId: null,
					packageInstanceId: null,
					earnedAt: new Date("2026-05-01T00:00:00.000Z"),
				},
			],
			insertReturn: [{ id: "corrected-split" }],
		});
		const result = await resolveDispute(makeDb(tx), {
			splitId: "s8",
			action: "adjust",
			note: "should have been RM80",
			adjustmentAmountCents: 8000,
			actor: ACTOR,
		});

		// Original split was voided.
		expect(tx.__setCalls[0].status).toBe("void");
		// A new manual split was inserted, anchored to the same target + amount.
		const newSplit = tx.__insertedValues.find(
			(v) => v?.splitType === "manual" && v?.calculatedAmount === 8000,
		);
		expect(newSplit).toBeDefined();
		expect(newSplit.appointmentId).toBe("appt-1");
		expect(newSplit.staffId).toBe(MEMBER_ID);
		// Below the RM500 review threshold → enters 'pending', not 'pending_review'.
		expect(newSplit.status).toBe("pending");
		expect(result.adjustment).not.toBeNull();
	});

	test("a large adjustment (≥ RM500) enters pending_review", async () => {
		const tx = makeTx({
			selectRow: [
				{
					id: "s9",
					staffId: MEMBER_ID,
					status: "contested",
					contestedFromStatus: "pending",
					appointmentId: null,
					salesOrderId: "so-1",
					packageInstanceId: null,
					earnedAt: new Date("2026-05-01T00:00:00.000Z"),
				},
			],
		});
		await resolveDispute(makeDb(tx), {
			splitId: "s9",
			action: "adjust",
			note: "big correction",
			adjustmentAmountCents: 60000, // RM600 ≥ RM500 threshold
			actor: ACTOR,
		});
		const newSplit = tx.__insertedValues.find(
			(v) => v?.splitType === "manual" && v?.calculatedAmount === 60000,
		);
		expect(newSplit.status).toBe("pending_review");
	});

	test("adjust rejects a zero amount", async () => {
		const tx = makeTx({
			selectRow: [
				{
					id: "s10",
					staffId: MEMBER_ID,
					status: "contested",
					contestedFromStatus: "pending",
					earnedAt: new Date("2026-05-01T00:00:00.000Z"),
				},
			],
		});
		await expect(
			resolveDispute(makeDb(tx), {
				splitId: "s10",
				action: "adjust",
				note: null,
				adjustmentAmountCents: 0,
				actor: ACTOR,
			}),
		).rejects.toThrow(/non-zero/i);
	});

	test("rejects resolving a split that is not contested", async () => {
		const tx = makeTx({
			selectRow: [{ id: "s11", staffId: MEMBER_ID, status: "approved" }],
		});
		await expect(
			resolveDispute(makeDb(tx), {
				splitId: "s11",
				action: "uphold",
				note: null,
				actor: ACTOR,
			}),
		).rejects.toThrow(/expected 'contested'/i);
	});
});
