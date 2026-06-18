/**
 * Unit tests for the voidCommissionSplit state-machine guards.
 *
 * Covers the P0 "commission money-reversal" gap (2026-06-01 coverage audit):
 * the void path must never reverse an already-PAID split, must be idempotent on
 * an already-void split, and must write an audit row on a real transition. These
 * are the safety invariants that keep money from being clawed back incorrectly.
 *
 * Uses the local mock tenant DB (no live database).
 */

import { describe, expect, it } from "bun:test";
import { voidCommissionSplit } from "./commission-splits.service";
import { createMockTx } from "./tests/mock-tenant-db";

const ACTOR = { userId: "user-1", memberId: "member-1", role: "admin" };

describe("voidCommissionSplit — guards", () => {
	it("throws NOT_FOUND when the split does not exist", async () => {
		const { db } = createMockTx({ selectRows: [] });
		await expect(
			voidCommissionSplit(db, "missing-id", "test", ACTOR),
		).rejects.toThrow(/not found/i);
	});

	it("refuses to void a PAID split (money already disbursed)", async () => {
		const { db, updates, inserts } = createMockTx({
			selectRows: [{ id: "cs-1", status: "paid" }],
		});
		await expect(
			voidCommissionSplit(db, "cs-1", "test", ACTOR),
		).rejects.toThrow(/paid/i);
		// No state change and no audit row on a rejected void.
		expect(updates).toHaveLength(0);
		expect(inserts).toHaveLength(0);
	});

	it("is idempotent on an already-void split (returns it, no re-write)", async () => {
		const existing = { id: "cs-2", status: "void", notes: "earlier reason" };
		const { db, updates, inserts } = createMockTx({ selectRows: [existing] });
		const result = await voidCommissionSplit(db, "cs-2", "again", ACTOR);
		expect(result).toEqual(existing as never);
		expect(updates).toHaveLength(0);
		expect(inserts).toHaveLength(0);
	});

	it("transitions a PENDING split to void and writes an audit row", async () => {
		const updatedRow = { id: "cs-3", status: "void", notes: "duplicate entry" };
		const { db, updates, inserts } = createMockTx({
			selectRows: [{ id: "cs-3", status: "pending" }],
			updateRows: [updatedRow],
		});

		const result = await voidCommissionSplit(
			db,
			"cs-3",
			"duplicate entry",
			ACTOR,
		);

		expect(result).toEqual(updatedRow as never);

		// Update set status=void with the reason as notes.
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject({
			status: "void",
			notes: "duplicate entry",
		});

		// Exactly one audit row, tagged commission.void, recording the prior status.
		expect(inserts).toHaveLength(1);
		expect(inserts[0]).toMatchObject({
			action: "commission.void",
			entityType: "commission_split",
			entityId: "cs-3",
			actorUserId: "user-1",
			changes: { previousStatus: "pending", reason: "duplicate entry" },
		});
	});

	it("transitions an APPROVED split to void (approved is reversible)", async () => {
		const updatedRow = { id: "cs-4", status: "void" };
		const { db, updates, inserts } = createMockTx({
			selectRows: [{ id: "cs-4", status: "approved" }],
			updateRows: [updatedRow],
		});

		await voidCommissionSplit(db, "cs-4", "correction", ACTOR);

		expect(updates).toHaveLength(1);
		expect(inserts).toHaveLength(1);
		expect(inserts[0]).toMatchObject({
			changes: { previousStatus: "approved", reason: "correction" },
		});
	});
});
