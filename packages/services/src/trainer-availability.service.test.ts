import { describe, expect, it, mock } from "bun:test";
import {
	addTrainerAvailabilityException,
	computeAvailableSlots,
	deleteTrainerAvailabilityException,
	listTrainerAvailabilityExceptions,
} from "./trainer-availability.service";
import { externalBusyBlocks } from "@avantej-core/db/schema/tenant/external-busy-blocks";

// biome-ignore lint/suspicious/noExplicitAny: test stubs
type AnyTenantDb = any;

describe("addTrainerAvailabilityException", () => {
	it("inserts a row and returns it", async () => {
		const returningMock = mock(() =>
			Promise.resolve([
				{
					id: "exc-1",
					trainerId: "t-1",
					date: "2026-06-15",
					kind: "timeoff",
					reason: "Vacation",
					createdAt: new Date(),
					createdBy: "u-1",
				},
			]),
		);
		const valuesMock = mock(() => ({ returning: returningMock }));
		const insertMock = mock(() => ({ values: valuesMock }));

		const tenantDb: AnyTenantDb = { insert: insertMock };

		const result = await addTrainerAvailabilityException(tenantDb, {
			trainerId: "t-1",
			date: "2026-06-15",
			kind: "timeoff",
			reason: "Vacation",
			createdBy: "u-1",
		});

		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(valuesMock).toHaveBeenCalledWith({
			trainerId: "t-1",
			date: "2026-06-15",
			kind: "timeoff",
			reason: "Vacation",
			createdBy: "u-1",
		});
		expect(result.id).toBe("exc-1");
		expect(result.kind).toBe("timeoff");
	});

	it("throws when insert returns no rows (DB error)", async () => {
		const tenantDb: AnyTenantDb = {
			insert: () => ({
				values: () => ({ returning: () => Promise.resolve([]) }),
			}),
		};

		await expect(
			addTrainerAvailabilityException(tenantDb, {
				trainerId: "t-1",
				date: "2026-06-15",
				kind: "blocked",
			}),
		).rejects.toThrow("Failed to create trainer availability exception");
	});
});

describe("listTrainerAvailabilityExceptions", () => {
	it("sorts results by date ascending", async () => {
		const rows = [
			{ id: "a", trainerId: "t-1", date: "2026-08-01", kind: "timeoff" },
			{ id: "b", trainerId: "t-1", date: "2026-06-01", kind: "timeoff" },
			{ id: "c", trainerId: "t-1", date: "2026-07-01", kind: "blocked" },
		];

		const whereMock = mock(() => Promise.resolve(rows));
		const fromMock = mock(() => ({ where: whereMock }));
		const selectMock = mock(() => ({ from: fromMock }));

		const tenantDb: AnyTenantDb = { select: selectMock };

		const result = await listTrainerAvailabilityExceptions(tenantDb, "t-1");

		expect(result.map((r) => r.date)).toEqual([
			"2026-06-01",
			"2026-07-01",
			"2026-08-01",
		]);
	});

	it("applies date range filter when provided", async () => {
		const whereMock = mock(() => Promise.resolve([]));
		const tenantDb: AnyTenantDb = {
			select: () => ({ from: () => ({ where: whereMock }) }),
		};

		await listTrainerAvailabilityExceptions(tenantDb, "t-1", {
			from: "2026-06-01",
			to: "2026-06-30",
		});

		// `where` is called with an `and(...)` of conditions — assertion at this
		// level just verifies the path runs without error. Drizzle's SQL builder
		// types prevent richer assertions without integration tests.
		expect(whereMock).toHaveBeenCalledTimes(1);
	});
});

describe("deleteTrainerAvailabilityException", () => {
	it("calls delete().where(eq(id))", async () => {
		const whereMock = mock(() => Promise.resolve(undefined));
		const deleteMock = mock(() => ({ where: whereMock }));

		const tenantDb: AnyTenantDb = { delete: deleteMock };

		await deleteTrainerAvailabilityException(tenantDb, "exc-1");

		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect(whereMock).toHaveBeenCalledTimes(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAvailableSlots — coach-intake union (recovered in 669625e1)
//
// Booking availability must read trainer_availability ∪ coach_intake_availability
// so admin-managed coach schedules surface to clients. These tests exercise the
// REAL union/dedupe in computeAvailableSlots (no mocking-away of the function).
// ─────────────────────────────────────────────────────────────────────────────

const JS_DAYS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
];

function recurringWindow(
	dayOfWeek: string,
	startTime: string,
	endTime: string,
	id: string,
) {
	return {
		id,
		trainerId: "t-1",
		dayOfWeek,
		startTime,
		endTime,
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

// tenantDb stub: trainer + coach recurring windows come from `query.*.findMany`;
// both `select()` chains (booked appointments + exceptions) resolve to [] so the
// recurring windows pass through unsubtracted.
function makeAvailabilityDb(opts: {
	trainer: unknown[];
	coach: unknown[];
}): AnyTenantDb {
	return {
		query: {
			trainerAvailability: { findMany: async () => opts.trainer },
			coachIntakeAvailability: { findMany: async () => opts.coach },
		},
		select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
	};
}

describe("computeAvailableSlots — coach-intake union", () => {
	it("surfaces an admin-managed coach-intake window with NO trainer_availability row", async () => {
		const day = new Date(2026, 5, 22);
		day.setHours(0, 0, 0, 0);
		const dayName = JS_DAYS[day.getDay()] as string;

		const tenantDb = makeAvailabilityDb({
			trainer: [],
			coach: [recurringWindow(dayName, "09:00", "10:00", "ci-1")],
		});

		const result = await computeAvailableSlots(tenantDb, "t-1", day, day);

		expect(result).toHaveLength(1);
		expect(result[0]?.dayOfWeek).toBe(dayName);
		expect(result[0]?.windows).toContainEqual({
			startTime: "09:00",
			endTime: "10:00",
		});
	});

	it("dedupes a window present in BOTH sources (day|start|end key)", async () => {
		const day = new Date(2026, 5, 22);
		day.setHours(0, 0, 0, 0);
		const dayName = JS_DAYS[day.getDay()] as string;

		const tenantDb = makeAvailabilityDb({
			trainer: [recurringWindow(dayName, "09:00", "10:00", "ta-1")],
			coach: [recurringWindow(dayName, "09:00", "10:00", "ci-1")],
		});

		const result = await computeAvailableSlots(tenantDb, "t-1", day, day);

		expect(result).toHaveLength(1);
		// One window, not two — the duplicate from coach-intake is collapsed.
		expect(result[0]?.windows).toEqual([
			{ startTime: "09:00", endTime: "10:00" },
		]);
	});

	it("returns nothing when neither source has a window (control)", async () => {
		const day = new Date(2026, 5, 22);
		day.setHours(0, 0, 0, 0);

		const tenantDb = makeAvailabilityDb({ trainer: [], coach: [] });
		const result = await computeAvailableSlots(tenantDb, "t-1", day, day);

		expect(result).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAvailableSlots — external (Google Calendar) busy blocks (UAT §6)
//
// A busy interval pulled from Google must remove the overlapping slot from the
// booking flow, exactly like a booked appointment. The mock routes the three
// select() chains by table: external_busy_blocks returns the seeded block,
// appointments + exceptions return [].
// ─────────────────────────────────────────────────────────────────────────────

function makeBusyBlockDb(opts: {
	trainer: unknown[];
	coach: unknown[];
	busy: { startTime: Date; endTime: Date }[];
}): AnyTenantDb {
	return {
		query: {
			trainerAvailability: { findMany: async () => opts.trainer },
			coachIntakeAvailability: { findMany: async () => opts.coach },
		},
		select: () => ({
			from: (table: unknown) => ({
				where: () =>
					Promise.resolve(table === externalBusyBlocks ? opts.busy : []),
			}),
		}),
	};
}

describe("computeAvailableSlots — external busy blocks", () => {
	it("removes a recurring window fully covered by a Google busy block", async () => {
		const day = new Date(2026, 5, 22);
		day.setHours(0, 0, 0, 0);
		const dayName = JS_DAYS[day.getDay()] as string;

		const tenantDb = makeBusyBlockDb({
			trainer: [recurringWindow(dayName, "09:00", "10:00", "ta-1")],
			coach: [],
			busy: [
				{
					startTime: new Date(2026, 5, 22, 9, 0, 0),
					endTime: new Date(2026, 5, 22, 10, 0, 0),
				},
			],
		});

		const result = await computeAvailableSlots(tenantDb, "t-1", day, day);

		// The whole 09:00–10:00 window is busy in Google → no bookable slot remains.
		expect(result).toHaveLength(0);
	});

	it("trims a window partially overlapped by a Google busy block", async () => {
		const day = new Date(2026, 5, 22);
		day.setHours(0, 0, 0, 0);
		const dayName = JS_DAYS[day.getDay()] as string;

		const tenantDb = makeBusyBlockDb({
			trainer: [recurringWindow(dayName, "09:00", "11:00", "ta-1")],
			coach: [],
			busy: [
				{
					startTime: new Date(2026, 5, 22, 9, 0, 0),
					endTime: new Date(2026, 5, 22, 10, 0, 0),
				},
			],
		});

		const result = await computeAvailableSlots(tenantDb, "t-1", day, day);

		// 09:00–10:00 is busy; 10:00–11:00 stays bookable.
		expect(result).toHaveLength(1);
		expect(result[0]?.windows).toEqual([
			{ startTime: "10:00", endTime: "11:00" },
		]);
	});

	it("leaves the window intact when no busy block overlaps (control)", async () => {
		const day = new Date(2026, 5, 22);
		day.setHours(0, 0, 0, 0);
		const dayName = JS_DAYS[day.getDay()] as string;

		const tenantDb = makeBusyBlockDb({
			trainer: [recurringWindow(dayName, "09:00", "10:00", "ta-1")],
			coach: [],
			busy: [],
		});

		const result = await computeAvailableSlots(tenantDb, "t-1", day, day);

		expect(result).toHaveLength(1);
		expect(result[0]?.windows).toContainEqual({
			startTime: "09:00",
			endTime: "10:00",
		});
	});
});
