import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import {
	createAnnouncement,
	listAnnouncements,
	listActiveAnnouncements,
	updateAnnouncement,
	deleteAnnouncement,
} from "@avantej-core/services";
import { announcements } from "@avantej-core/db/schema/tenant/announcements";

const createdIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || createdIds.length === 0) return;
	await tenantDb
		.delete(announcements)
		.where(inArray(announcements.id, createdIds));
});

describe("Announcements Integration", () => {
	test("create -> list -> update -> soft-delete lifecycle", async () => {
		if (shouldSkipIntegration()) return;

		// Create
		const created = await createAnnouncement(tenantDb, {
			branchId: TEST_BRANCH_NODE_ID,
			title: "Integration Test Announcement",
			message: "This is a test announcement for integration testing.",
			priority: "high",
			targetAudience: "all",
			isPinned: true,
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(created.id);

		expect(created.isActive).toBe(true);
		expect(created.isPinned).toBe(true);
		expect(created.priority).toBe("high");
		expect(created.title).toBe("Integration Test Announcement");

		// List - should appear
		const list = await listAnnouncements(tenantDb, { isActive: true });
		expect(list.some((a) => a.id === created.id)).toBe(true);

		// Update priority and targetAudience
		const updated = await updateAnnouncement(tenantDb, created.id, {
			priority: "urgent",
			targetAudience: "staff",
		});
		expect(updated.priority).toBe("urgent");
		expect(updated.targetAudience).toBe("staff");
		expect(updated.title).toBe("Integration Test Announcement"); // unchanged

		// Soft-delete (sets isActive=false)
		const deleted = await deleteAnnouncement(tenantDb, created.id);
		expect(deleted.isActive).toBe(false);

		// Should no longer appear in active list
		const activeList = await listAnnouncements(tenantDb, { isActive: true });
		expect(activeList.some((a) => a.id === created.id)).toBe(false);
	}, 30000);

	test("listActiveAnnouncements excludes expired announcements", async () => {
		if (shouldSkipIntegration()) return;

		// Create an expired announcement (endDate in the past)
		const expired = await createAnnouncement(tenantDb, {
			title: "Expired Announcement",
			message: "This announcement has already expired.",
			startDate: new Date("2020-01-01"),
			endDate: new Date("2020-12-31"),
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(expired.id);

		// Create a currently active announcement
		const active = await createAnnouncement(tenantDb, {
			title: "Active Announcement",
			message: "This announcement is currently active.",
			startDate: new Date("2025-01-01"),
			endDate: new Date("2027-12-31"),
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(active.id);

		// listActiveAnnouncements should exclude expired, include active
		const result = await listActiveAnnouncements(tenantDb, {
			accessibleNodeIds: [],
		});

		expect(result.some((a) => a.id === expired.id)).toBe(false);
		expect(result.some((a) => a.id === active.id)).toBe(true);
	}, 30000);

	test("listActiveAnnouncements filters by targetAudience", async () => {
		if (shouldSkipIntegration()) return;

		const staffOnly = await createAnnouncement(tenantDb, {
			title: "Staff Only Announcement",
			message: "Only visible to staff members.",
			targetAudience: "staff",
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(staffOnly.id);

		const clientOnly = await createAnnouncement(tenantDb, {
			title: "Client Only Announcement",
			message: "Only visible to clients.",
			targetAudience: "clients",
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(clientOnly.id);

		// Staff filter should include staff-only and "all", exclude client-only
		const staffResult = await listActiveAnnouncements(tenantDb, {
			accessibleNodeIds: [],
			memberType: "staff",
		});
		expect(staffResult.some((a) => a.id === staffOnly.id)).toBe(true);
		expect(staffResult.some((a) => a.id === clientOnly.id)).toBe(false);

		// Client filter should include client-only and "all", exclude staff-only
		const clientResult = await listActiveAnnouncements(tenantDb, {
			accessibleNodeIds: [],
			memberType: "clients",
		});
		expect(clientResult.some((a) => a.id === clientOnly.id)).toBe(true);
		expect(clientResult.some((a) => a.id === staffOnly.id)).toBe(false);
	}, 30000);

	test("pinned announcements appear before unpinned", async () => {
		if (shouldSkipIntegration()) return;

		const unpinned = await createAnnouncement(tenantDb, {
			title: "Unpinned Announcement",
			message: "Not pinned.",
			isPinned: false,
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(unpinned.id);

		const pinned = await createAnnouncement(tenantDb, {
			title: "Pinned Announcement",
			message: "This is pinned.",
			isPinned: true,
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(pinned.id);

		const list = await listAnnouncements(tenantDb, { isActive: true });
		const pinnedIdx = list.findIndex((a) => a.id === pinned.id);
		const unpinnedIdx = list.findIndex((a) => a.id === unpinned.id);

		if (pinnedIdx !== -1 && unpinnedIdx !== -1) {
			expect(pinnedIdx).toBeLessThan(unpinnedIdx);
		}
	}, 30000);
});
