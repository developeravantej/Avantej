import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { getMembersNewToday } from "@avantej-core/services/member-stats.service";

let mockDb: ReturnType<typeof createMockTenantDb>;

const BRANCH_ID = "branch-uuid-0001";
const NODE_ID_1 = "node-uuid-0001";
const NODE_ID_2 = "node-uuid-0002";

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

// ─── getMembersNewToday ─────────────────────────────────────────────────────

describe("getMembersNewToday", () => {
	test("happy path — returns count and up to 3 recent members", async () => {
		const recentMembers = [
			{ id: "m-1", userId: "u-1", joinedAt: new Date() },
			{ id: "m-2", userId: "u-2", joinedAt: new Date() },
			{ id: "m-3", userId: "u-3", joinedAt: new Date() },
		];

		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 5 }])) // count query
			.mockReturnValueOnce(selectChain(recentMembers)); // top-3 query

		const result = await getMembersNewToday(mockDb, {
			accessibleNodeIds: [NODE_ID_1, NODE_ID_2],
		});

		expect(result.count).toBe(5);
		expect(result.recent).toHaveLength(3);
		expect(result.recent[0]!.id).toBe("m-1");
	});

	test("returns zero count and empty recent when no members joined today", async () => {
		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 0 }]))
			.mockReturnValueOnce(selectChain([]));

		const result = await getMembersNewToday(mockDb, {
			accessibleNodeIds: [],
		});

		expect(result.count).toBe(0);
		expect(result.recent).toHaveLength(0);
	});

	test("applies branchId filter when provided — overrides accessibleNodeIds", async () => {
		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 2 }]))
			.mockReturnValueOnce(
				selectChain([
					{ id: "m-4", userId: "u-4", joinedAt: new Date() },
					{ id: "m-5", userId: "u-5", joinedAt: new Date() },
				]),
			);

		const result = await getMembersNewToday(mockDb, {
			accessibleNodeIds: [NODE_ID_1, NODE_ID_2],
			branchId: BRANCH_ID,
		});

		expect(result.count).toBe(2);
		expect(result.recent).toHaveLength(2);
		// Verify both selects were called (count + recent)
		expect(mockDb.select).toHaveBeenCalledTimes(2);
	});

	test("no hierarchy filter applied when accessibleNodeIds is empty and no branchId", async () => {
		// Admin path: empty accessibleNodeIds means no scope restriction
		mockDb.select
			.mockReturnValueOnce(selectChain([{ cnt: 12 }]))
			.mockReturnValueOnce(
				selectChain([
					{ id: "m-1", userId: "u-1", joinedAt: new Date() },
					{ id: "m-2", userId: "u-2", joinedAt: new Date() },
					{ id: "m-3", userId: "u-3", joinedAt: new Date() },
				]),
			);

		const result = await getMembersNewToday(mockDb, {
			accessibleNodeIds: [],
		});

		expect(result.count).toBe(12);
		expect(result.recent).toHaveLength(3);
	});
});
