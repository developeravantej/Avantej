import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeAnnouncement } from "../../helpers/fixtures";

import {
	listAnnouncements,
	listActiveAnnouncements,
	createAnnouncement,
	updateAnnouncement,
	deleteAnnouncement,
} from "@avantej-core/services/announcements.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

function selectChainResolving(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of ["from", "where", "orderBy", "limit", "offset", "leftJoin", "innerJoin", "groupBy", "having"]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// Helper: list services enrich each row with scopedBranchIds via a 2nd select
// call (announcementScopes). Stub both calls so assertions can use enriched shape.
function expectEnriched(items: ReturnType<typeof makeAnnouncement>[]) {
	return items.map((i) => ({ ...i, scopedBranchIds: [] as string[] }));
}

// ─── listAnnouncements ──────────────────────────────────────────────────────
describe("listAnnouncements", () => {
	test("returns announcements from select chain", async () => {
		const items = [makeAnnouncement(), makeAnnouncement()];
		mockDb.select.mockReturnValueOnce(selectChainResolving(items));
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // enrichWithScopes

		const result = await listAnnouncements(mockDb, {});

		expect(result).toEqual(expectEnriched(items) as any);
		expect(mockDb.select).toHaveBeenCalledTimes(2);
	});

	test("returns empty array when no announcements exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));
		// enrichWithScopes short-circuits when rows is empty — no 2nd select.

		const result = await listAnnouncements(mockDb, {});

		expect(result).toEqual([]);
	});
});

// ─── listActiveAnnouncements ─────────────────────────────────────────────────
// NOTE: buildScopeFilter calls tenantDb.select() twice (notExists + exists
// subqueries) when accessibleNodeIds is non-empty. Those select calls consume
// mockReturnValueOnce queue entries BEFORE the main query runs. Queue 4
// returns: [notExistsSubquery, existsSubquery, mainQuery, enrichScopes].
describe("listActiveAnnouncements", () => {
	test("returns only active announcements", async () => {
		const active = [makeAnnouncement({ isActive: true })];
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // notExists subquery
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // exists subquery
		mockDb.select.mockReturnValueOnce(selectChainResolving(active)); // main query
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // enrichWithScopes

		const result = await listActiveAnnouncements(mockDb, {
			accessibleNodeIds: [BRANCH_NODE_ID],
		});

		expect(result).toEqual(expectEnriched(active) as any);
	});

	test("filters by memberType when provided", async () => {
		const staffAnnouncement = makeAnnouncement({ targetAudience: "staff" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // notExists subquery
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // exists subquery
		mockDb.select.mockReturnValueOnce(selectChainResolving([staffAnnouncement])); // main
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // enrichWithScopes

		const result = await listActiveAnnouncements(mockDb, {
			accessibleNodeIds: [BRANCH_NODE_ID],
			memberType: "staff",
		});

		expect(result).toHaveLength(1);
		expect(result[0]!.targetAudience).toBe("staff");
		expect(result[0]!.scopedBranchIds).toEqual([]);
	});
});

// ─── createAnnouncement ──────────────────────────────────────────────────────
describe("createAnnouncement", () => {
	test("creates announcement with isActive=true by default", async () => {
		const announcement = makeAnnouncement({ isActive: true });
		const insertValues = { returning: mock(() => Promise.resolve([announcement])) };
		mockDb.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

		const result = await createAnnouncement(mockDb, {
			title: "Test",
			message: "Test message",
			createdBy: MEMBER_ID,
		});

		expect(result.isActive).toBe(true);
		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});

	test("creates announcement with priority and audience defaults", async () => {
		const announcement = makeAnnouncement({ priority: "normal", targetAudience: "all" });
		const insertValues = { returning: mock(() => Promise.resolve([announcement])) };
		mockDb.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

		const result = await createAnnouncement(mockDb, {
			title: "Test",
			message: "Body",
			createdBy: MEMBER_ID,
		});

		expect(result.priority).toBe("normal");
		expect(result.targetAudience).toBe("all");
	});

	test("throws when insert returns no rows", async () => {
		const insertValues = { returning: mock(() => Promise.resolve([])) };
		mockDb.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

		await expect(
			createAnnouncement(mockDb, { title: "fail", message: "fail", createdBy: MEMBER_ID }),
		).rejects.toThrow("Failed to create announcement");
	});
});

// ─── updateAnnouncement ──────────────────────────────────────────────────────
describe("updateAnnouncement", () => {
	test("updates isPinned flag", async () => {
		const updated = makeAnnouncement({ isPinned: true });
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([updated])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await updateAnnouncement(mockDb, updated.id, { isPinned: true });

		expect(result.isPinned).toBe(true);
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("throws when announcement not found", async () => {
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(
			updateAnnouncement(mockDb, "nonexistent", { title: "x" }),
		).rejects.toThrow("Announcement not found");
	});
});

// ─── deleteAnnouncement ──────────────────────────────────────────────────────
describe("deleteAnnouncement", () => {
	test("soft-deletes by setting isActive=false", async () => {
		const deleted = makeAnnouncement({ isActive: false });
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([deleted])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deleteAnnouncement(mockDb, deleted.id);

		expect(result.isActive).toBe(false);
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("throws when announcement not found", async () => {
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(deleteAnnouncement(mockDb, "nonexistent")).rejects.toThrow("Announcement not found");
	});
});
