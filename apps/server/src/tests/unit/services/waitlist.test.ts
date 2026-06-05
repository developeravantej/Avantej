import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
	createMockTenantDb,
	selectChainResolving,
} from "../../helpers/db-mock.factory";
import { makeWaitlistEntry, makeClassSlot } from "../../helpers/fixtures";

import {
	listWaitlistEntries,
	addToWaitlist,
	removeFromWaitlist,
	promoteFromWaitlist,
} from "@avantej-core/services/waitlist.service";

let mockDb: any;

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listWaitlistEntries ─────────────────────────────────────────────────────
describe("listWaitlistEntries", () => {
	test("returns all waitlist entries when no filters", async () => {
		const entries = [makeWaitlistEntry(), makeWaitlistEntry()];
		mockDb.query.waitlistEntries.findMany.mockResolvedValueOnce(entries);

		const result = await listWaitlistEntries(mockDb, {});

		expect(result).toEqual(entries as any);
		expect(mockDb.query.waitlistEntries.findMany).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no entries exist", async () => {
		mockDb.query.waitlistEntries.findMany.mockResolvedValueOnce([]);

		const result = await listWaitlistEntries(mockDb);

		expect(result).toEqual([]);
	});

	test("filters by classSlotId", async () => {
		const slotId = "slot-uuid";
		const entry = makeWaitlistEntry({ classSlotId: slotId });
		mockDb.query.waitlistEntries.findMany.mockResolvedValueOnce([entry]);

		const result = await listWaitlistEntries(mockDb, {
			classSlotId: slotId,
		});

		expect(result).toHaveLength(1);
	});
});

// ─── addToWaitlist ───────────────────────────────────────────────────────────
describe("addToWaitlist", () => {
	test("adds customer to waitlist when class slot is full", async () => {
		const slot = makeClassSlot({ isFull: true });
		const entry = makeWaitlistEntry({ position: 1 });

		// addToWaitlist runs entirely inside a transaction; the mock passes the
		// SAME mockDb instance to the callback, so configure mockDb directly.
		// 1st select(): lock slot row FOR UPDATE → resolves [slot]
		// 2nd select(): count existing waiting entries → resolves [{ value: 0 }]
		mockDb.select
			.mockReturnValueOnce(selectChainResolving([slot]))
			.mockReturnValueOnce(selectChainResolving([{ value: 0 }]));
		// No existing waitlist entry for this member
		mockDb.query.waitlistEntries.findFirst.mockResolvedValueOnce(undefined);

		// Insert waitlist entry
		const insertValues = {
			returning: mock(() => Promise.resolve([entry])),
		};
		const insertChain = { values: mock(() => insertValues) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		const result = await addToWaitlist(mockDb, {
			classSlotId: slot.id,
			memberId: "member-1",
			userId: "user-1",
		});

		expect(result.status).toBe("waiting");
		expect(result.position).toBe(1);
	});

	test("throws when class slot not found", async () => {
		// Slot lock select resolves to empty → slot not found
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await expect(
			addToWaitlist(mockDb, {
				classSlotId: "nonexistent",
				memberId: "m1",
				userId: "u1",
			}),
		).rejects.toThrow("Class slot not found");
	});

	test("throws when class slot is not full", async () => {
		const slot = makeClassSlot({ isFull: false });
		mockDb.select.mockReturnValueOnce(selectChainResolving([slot]));

		await expect(
			addToWaitlist(mockDb, {
				classSlotId: slot.id,
				memberId: "m1",
				userId: "u1",
			}),
		).rejects.toThrow(
			"Class slot is not full. Book directly instead of joining the waitlist.",
		);
	});

	test("throws when member is already on the waitlist", async () => {
		const slot = makeClassSlot({ isFull: true });
		const existing = makeWaitlistEntry({ status: "waiting" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([slot]));
		mockDb.query.waitlistEntries.findFirst.mockResolvedValueOnce(existing);

		await expect(
			addToWaitlist(mockDb, {
				classSlotId: slot.id,
				memberId: "m1",
				userId: "u1",
			}),
		).rejects.toThrow("Member is already on the waitlist for this class slot");
	});
});

// ─── removeFromWaitlist ──────────────────────────────────────────────────────
describe("removeFromWaitlist", () => {
	test("sets status to cancelled", async () => {
		const cancelled = makeWaitlistEntry({ status: "cancelled" });
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([cancelled])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await removeFromWaitlist(mockDb, cancelled.id);

		expect(result.status).toBe("cancelled");
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("throws when entry not found", async () => {
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(removeFromWaitlist(mockDb, "nonexistent")).rejects.toThrow(
			"Waitlist entry not found",
		);
	});
});

// ─── promoteFromWaitlist ─────────────────────────────────────────────────────
describe("promoteFromWaitlist", () => {
	test("promotes the earliest waiting entry via transaction", async () => {
		const entry = makeWaitlistEntry({ status: "waiting", position: 1 });
		const promoted = { ...entry, status: "promoted" };

		// promoteFromWaitlist wraps promoteFromWaitlistInsideTx in a transaction.
		// Inside the tx the service, in order:
		//   1. finds the earliest "waiting" entry (query.waitlistEntries.findFirst)
		//   2. update(classSlots) capacity claim → .returning({ id }) must be
		//      non-empty to signal a spot was secured
		//   3. update(waitlistEntries) promote → .returning() → [promoted]
		//   4. query.classSlots.findFirst for slot (returns undefined here, so the
		//      appointment-creation/notification block is skipped) → returns promoted
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			tx.query.waitlistEntries.findFirst.mockResolvedValueOnce(entry);

			// 1st update: classSlots capacity claim → returning({ id }) non-empty
			const claimChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([{ id: "slot-id" }])),
				})),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => claimChain) });

			// 2nd update: waitlistEntries promote → returning() → [promoted]
			const promoteChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([promoted])),
				})),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => promoteChain) });

			// slot fetch returns undefined → skip appointment + notification block
			tx.query.classSlots.findFirst.mockResolvedValueOnce(undefined);

			return cb(tx);
		});

		const result = await promoteFromWaitlist(mockDb, "slot-id");

		expect(result!.status).toBe("promoted");
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
	});

	test("returns null when no waiting entries exist", async () => {
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			tx.query.waitlistEntries.findFirst.mockResolvedValueOnce(undefined);
			return cb(tx);
		});

		const result = await promoteFromWaitlist(mockDb, "slot-id");

		expect(result).toBeNull();
	});
});
