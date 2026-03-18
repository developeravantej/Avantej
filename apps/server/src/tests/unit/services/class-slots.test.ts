import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeClassSlot } from "../../helpers/fixtures";

import {
	listClassSlots,
	getClassSlotById,
	createClassSlot,
	cancelClassSlot,
	incrementBooking,
	decrementBooking,
} from "@avantej-core/services/class-slots.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listClassSlots ──────────────────────────────────────────────────────────
describe("listClassSlots", () => {
	test("returns class slots via query.classSlots.findMany", async () => {
		const slots = [makeClassSlot(), makeClassSlot()];
		mockDb.query.classSlots.findMany.mockResolvedValueOnce(slots);

		const result = await listClassSlots(mockDb, {});

		expect(result).toEqual(slots);
		expect(mockDb.query.classSlots.findMany).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no slots exist", async () => {
		mockDb.query.classSlots.findMany.mockResolvedValueOnce([]);

		const result = await listClassSlots(mockDb, {});

		expect(result).toEqual([]);
	});

	test("passes serviceId filter", async () => {
		const serviceId = "service-uuid";
		mockDb.query.classSlots.findMany.mockResolvedValueOnce([]);

		await listClassSlots(mockDb, { serviceId });

		const callArgs = mockDb.query.classSlots.findMany.mock.calls[0][0];
		expect(callArgs.where).toBeDefined();
	});
});

// ─── getClassSlotById ────────────────────────────────────────────────────────
describe("getClassSlotById", () => {
	test("returns class slot when found", async () => {
		const slot = makeClassSlot();
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);

		const result = await getClassSlotById(mockDb, slot.id);

		expect(result).toEqual(slot);
	});

	test("returns undefined when not found", async () => {
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(undefined);

		const result = await getClassSlotById(mockDb, "nonexistent");

		expect(result).toBeUndefined();
	});
});

// ─── createClassSlot ─────────────────────────────────────────────────────────
describe("createClassSlot", () => {
	test("creates a class slot with correct defaults", async () => {
		const slot = makeClassSlot({
			capacity: 10,
			spotsAvailable: 10,
			spotsBooked: 0,
			isFull: false,
			isAvailable: true,
			isCancelled: false,
		});
		const insertValues = {
			returning: mock(() => Promise.resolve([slot])),
		};
		const insertChain = { values: mock(() => insertValues) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		const result = await createClassSlot(mockDb, {
			serviceId: slot.serviceId as string,
			branchId: BRANCH_NODE_ID,
			date: new Date("2026-03-01"),
			startTime: "09:00",
			endTime: "10:00",
			capacity: 10,
		});

		expect(result.capacity).toBe(10);
		expect(result.isAvailable).toBe(true);
		expect(result.isCancelled).toBe(false);
		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});

	test("throws when insert returns no rows", async () => {
		const insertValues = {
			returning: mock(() => Promise.resolve([])),
		};
		const insertChain = { values: mock(() => insertValues) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		await expect(
			createClassSlot(mockDb, {
				serviceId: "s1",
				branchId: BRANCH_NODE_ID,
				date: new Date(),
				startTime: "09:00",
				endTime: "10:00",
				capacity: 5,
			}),
		).rejects.toThrow("Failed to create class slot");
	});
});

// ─── cancelClassSlot ─────────────────────────────────────────────────────────
describe("cancelClassSlot", () => {
	test("cancels a class slot (sets isCancelled=true, isAvailable=false)", async () => {
		const cancelled = makeClassSlot({
			isCancelled: true,
			isAvailable: false,
		});
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([cancelled])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await cancelClassSlot(mockDb, cancelled.id);

		expect(result.isCancelled).toBe(true);
		expect(result.isAvailable).toBe(false);
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("throws when class slot not found", async () => {
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(cancelClassSlot(mockDb, "nonexistent")).rejects.toThrow(
			"Class slot not found",
		);
	});

	test("accepts optional cancellation reason", async () => {
		const cancelled = makeClassSlot({
			isCancelled: true,
			cancellationReason: "Instructor sick",
		});
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([cancelled])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await cancelClassSlot(
			mockDb,
			cancelled.id,
			"Instructor sick",
		);

		expect(result.isCancelled).toBe(true);
	});
});

// ─── incrementBooking ────────────────────────────────────────────────────────
describe("incrementBooking", () => {
	test("increments booking count and updates availability", async () => {
		const slot = makeClassSlot({
			capacity: 5,
			spotsBooked: 2,
			spotsAvailable: 3,
			isFull: false,
			isCancelled: false,
		});
		const updated = {
			...slot,
			spotsBooked: 3,
			spotsAvailable: 2,
			isFull: false,
		};
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([updated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await incrementBooking(mockDb, slot.id);

		expect(result.spotsBooked).toBe(3);
	});

	test("throws when class slot is full", async () => {
		const slot = makeClassSlot({ isFull: true, isCancelled: false });
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);

		await expect(incrementBooking(mockDb, slot.id)).rejects.toThrow(
			"Class slot is full",
		);
	});

	test("throws when class slot is cancelled", async () => {
		const slot = makeClassSlot({ isCancelled: true, isFull: false });
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);

		await expect(incrementBooking(mockDb, slot.id)).rejects.toThrow(
			"Class slot is cancelled",
		);
	});

	test("throws when class slot not found", async () => {
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(undefined);

		await expect(incrementBooking(mockDb, "nonexistent")).rejects.toThrow(
			"Class slot not found",
		);
	});
});

// ─── decrementBooking ────────────────────────────────────────────────────────
describe("decrementBooking", () => {
	test("throws when no bookings to decrement", async () => {
		const slot = makeClassSlot({ spotsBooked: 0 });
		mockDb.query.classSlots.findFirst.mockResolvedValueOnce(slot);

		await expect(decrementBooking(mockDb, slot.id)).rejects.toThrow(
			"No bookings to decrement",
		);
	});
});
