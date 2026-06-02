import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
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

		// Check slot exists + is full
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);
		// No existing waitlist entry
		mockDb.query.waitlistEntries.findFirst.mockResolvedValueOnce(undefined);
		// Count existing entries
		const countChain = mockDb.select();
		countChain.then = (resolve: (v: unknown) => unknown) =>
			Promise.resolve([{ value: 0 }]).then(resolve);

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
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(undefined);

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
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);

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
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);
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

		// transaction callback receives tx (which is another mockDb)
		// The transaction mock calls the callback with a new mockDb
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			tx.query.waitlistEntries.findFirst.mockResolvedValueOnce(entry);
			const setChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([promoted])),
				})),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => setChain) });
			// Second update for classSlots
			const setChain2 = {
				where: mock(() => Promise.resolve()),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => setChain2) });
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
