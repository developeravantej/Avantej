import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import {
	getTrainerWeeklyStats,
	getTrainerWeeklySchedule,
	getTrainerWeeklyStatsBatch,
} from "@avantej-core/services/trainer.service";

let mockDb: ReturnType<typeof createMockTenantDb>;

const USER_ID = "user-uuid-0001";
const MEMBER_PK = "aaaaaaaa-0000-4000-8000-000000000001";
const WEEK_START = new Date("2026-05-12T00:00:00.000Z");

function selectChain(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of [
		"from",
		"where",
		"orderBy",
		"limit",
		"offset",
		"leftJoin",
		"innerJoin",
		"groupBy",
		"having",
	]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── getTrainerWeeklyStats ──────────────────────────────────────────────────

describe("getTrainerWeeklyStats", () => {
	test("happy path — returns correct stats with utilization", async () => {
		// findFirst → member row
		mockDb.query.members.findFirst.mockResolvedValueOnce({ id: MEMBER_PK });

		// Promise.all selects: sessions, commission, revenue, capacity
		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 5 }])) // sessions
			.mockReturnValueOnce(selectChain([{ total: 120000 }])) // commission YTD
			.mockReturnValueOnce(selectChain([{ total: 250000 }])) // revenue
			.mockReturnValueOnce(selectChain([{ totalCapacity: 10 }])); // capacity

		const result = await getTrainerWeeklyStats(mockDb, USER_ID, WEEK_START);

		expect(result.memberId).toBe(USER_ID);
		expect(result.sessionsThisWeek).toBe(5);
		expect(result.utilizationPct).toBe(50); // 5 / 10 * 100
		expect(result.commissionYtd).toBe(120000);
		expect(result.revenueGenerated).toBe(250000);
	});

	test("returns 0 utilization when no class slots in week", async () => {
		mockDb.query.members.findFirst.mockResolvedValueOnce({ id: MEMBER_PK });

		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 3 }]))
			.mockReturnValueOnce(selectChain([{ total: 50000 }]))
			.mockReturnValueOnce(selectChain([{ total: 75000 }]))
			.mockReturnValueOnce(selectChain([{ totalCapacity: 0 }]));

		const result = await getTrainerWeeklyStats(mockDb, USER_ID, WEEK_START);

		expect(result.utilizationPct).toBe(0);
		expect(result.sessionsThisWeek).toBe(3);
	});

	test("handles missing member row gracefully (no member PK found)", async () => {
		// findFirst returns undefined — trainer not found in tenant
		mockDb.query.members.findFirst.mockResolvedValueOnce(undefined);

		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 0 }]))
			.mockReturnValueOnce(selectChain([{ total: 0 }]))
			.mockReturnValueOnce(selectChain([{ total: 0 }]))
			.mockReturnValueOnce(selectChain([{ totalCapacity: 0 }]));

		const result = await getTrainerWeeklyStats(mockDb, USER_ID, WEEK_START);

		expect(result.sessionsThisWeek).toBe(0);
		expect(result.utilizationPct).toBe(0);
		expect(result.commissionYtd).toBe(0);
	});

	test("caps utilization at 100 when sessions exceed capacity", async () => {
		mockDb.query.members.findFirst.mockResolvedValueOnce({ id: MEMBER_PK });

		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 15 }]))
			.mockReturnValueOnce(selectChain([{ total: 0 }]))
			.mockReturnValueOnce(selectChain([{ total: 0 }]))
			.mockReturnValueOnce(selectChain([{ totalCapacity: 10 }]));

		const result = await getTrainerWeeklyStats(mockDb, USER_ID, WEEK_START);

		expect(result.utilizationPct).toBe(100);
	});
});

// ─── getTrainerWeeklySchedule ───────────────────────────────────────────────

describe("getTrainerWeeklySchedule", () => {
	test("happy path — returns merged and sorted entries", async () => {
		mockDb.query.members.findFirst.mockResolvedValueOnce({ id: MEMBER_PK });

		const apptRow = {
			id: "appt-1",
			startTime: new Date("2026-05-13T09:00:00Z"),
			endTime: new Date("2026-05-13T10:00:00Z"),
			serviceId: "svc-1",
		};
		const slotRow = {
			id: "slot-1",
			date: new Date("2026-05-13T08:00:00Z"),
			startTime: "08:00",
			endTime: "09:00",
			serviceId: "svc-2",
		};

		mockDb.select
			.mockReturnValueOnce(selectChain([apptRow])) // appointments
			.mockReturnValueOnce(selectChain([slotRow])); // class slots

		const result = await getTrainerWeeklySchedule(mockDb, USER_ID, WEEK_START);

		expect(result.memberId).toBe(USER_ID);
		// slot (08:00) should be before appointment (09:00) after sort
		expect(result.entries[0]!.type).toBe("class_slot");
		expect(result.entries[1]!.type).toBe("appointment");
	});

	test("returns empty entries when member not found", async () => {
		mockDb.query.members.findFirst.mockResolvedValueOnce(undefined);

		mockDb.select
			.mockReturnValueOnce(selectChain([])) // appointments (trainerId="" returns nothing)
			.mockReturnValueOnce(selectChain([])); // no slots — memberPk undefined branch

		const result = await getTrainerWeeklySchedule(mockDb, USER_ID, WEEK_START);

		expect(result.entries).toHaveLength(0);
	});

	test("respects 200-entry combined limit", async () => {
		mockDb.query.members.findFirst.mockResolvedValueOnce({ id: MEMBER_PK });

		const appts = Array.from({ length: 150 }, (_, i) => ({
			id: `appt-${i}`,
			startTime: new Date(
				`2026-05-13T${String(Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6) * 10).padStart(2, "0")}:00Z`,
			),
			endTime: new Date("2026-05-13T10:00:00Z"),
			serviceId: null,
		}));
		const slots = Array.from({ length: 100 }, (_, i) => ({
			id: `slot-${i}`,
			date: new Date("2026-05-12T07:00:00Z"),
			startTime: "07:00",
			endTime: "08:00",
			serviceId: null,
		}));

		mockDb.select
			.mockReturnValueOnce(selectChain(appts))
			.mockReturnValueOnce(selectChain(slots));

		const result = await getTrainerWeeklySchedule(mockDb, USER_ID, WEEK_START);

		expect(result.entries.length).toBeLessThanOrEqual(200);
	});
});

// ─── getTrainerWeeklyStatsBatch ─────────────────────────────────────────────

describe("getTrainerWeeklyStatsBatch", () => {
	test("happy path — returns a Map with stats for each userId", async () => {
		const USER_ID_2 = "user-uuid-0002";
		const MEMBER_PK_2 = "bbbbbbbb-0000-4000-8000-000000000001";

		// inArray members select
		mockDb.select
			.mockReturnValueOnce(
				selectChain([
					{ id: MEMBER_PK, userId: USER_ID },
					{ id: MEMBER_PK_2, userId: USER_ID_2 },
				]),
			)
			// sessions GROUP BY trainerId
			.mockReturnValueOnce(
				selectChain([
					{ trainerId: MEMBER_PK, cnt: 3 },
					{ trainerId: MEMBER_PK_2, cnt: 7 },
				]),
			)
			// commission GROUP BY staffId
			.mockReturnValueOnce(
				selectChain([
					{ staffId: USER_ID, total: 60000 },
					{ staffId: USER_ID_2, total: 90000 },
				]),
			)
			// revenue GROUP BY trainerId
			.mockReturnValueOnce(
				selectChain([
					{ trainerId: MEMBER_PK, total: 150000 },
					{ trainerId: MEMBER_PK_2, total: 200000 },
				]),
			)
			// capacity GROUP BY instructorId
			.mockReturnValueOnce(
				selectChain([
					{ instructorId: MEMBER_PK, totalCapacity: 10 },
					{ instructorId: MEMBER_PK_2, totalCapacity: 14 },
				]),
			);

		const result = await getTrainerWeeklyStatsBatch(
			mockDb,
			[USER_ID, USER_ID_2],
			WEEK_START,
		);

		expect(result.size).toBe(2);

		const stats1 = result.get(USER_ID)!;
		expect(stats1.sessionsThisWeek).toBe(3);
		expect(stats1.utilizationPct).toBe(30);
		expect(stats1.commissionYtd).toBe(60000);
		expect(stats1.revenueGenerated).toBe(150000);

		const stats2 = result.get(USER_ID_2)!;
		expect(stats2.sessionsThisWeek).toBe(7);
		expect(stats2.utilizationPct).toBe(50);
	});

	test("returns empty Map when memberIds is empty", async () => {
		const result = await getTrainerWeeklyStatsBatch(mockDb, [], WEEK_START);
		expect(result.size).toBe(0);
	});

	test("throws when memberIds exceeds 100", async () => {
		const ids = Array.from({ length: 101 }, (_, i) => `user-${i}`);
		expect(getTrainerWeeklyStatsBatch(mockDb, ids, WEEK_START)).rejects.toThrow(
			"max 100",
		);
	});

	test("returns zero stats for userId not found in tenant DB", async () => {
		// members select returns empty (userId not in tenant)
		mockDb.select
			.mockReturnValueOnce(selectChain([])) // members
			.mockReturnValueOnce(selectChain([])) // sessions (empty — no pks)
			.mockReturnValueOnce(selectChain([])) // commission
			.mockReturnValueOnce(selectChain([])) // revenue
			.mockReturnValueOnce(selectChain([])); // capacity

		const result = await getTrainerWeeklyStatsBatch(
			mockDb,
			[USER_ID],
			WEEK_START,
		);

		const stats = result.get(USER_ID)!;
		expect(stats.sessionsThisWeek).toBe(0);
		expect(stats.utilizationPct).toBe(0);
		expect(stats.commissionYtd).toBe(0);
		expect(stats.revenueGenerated).toBe(0);
	});
});
