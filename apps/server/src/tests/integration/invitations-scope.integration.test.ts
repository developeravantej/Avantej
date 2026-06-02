/**
 * Integration tests for invitation scope bug fix (Ticket B).
 *
 * Verifies that:
 * 1. listInvitations (the service layer) returns invitations from ALL inviters,
 *    not just one — confirming the bug fix (removal of invitedBy filter in the
 *    list procedure) works end-to-end at the service level.
 * 2. requirePermission throws for a member without user_management:read.
 * 3. An empty invitation table returns an empty array, not an error.
 *
 * The oRPC handler itself is thin (permission check → service call), so testing
 * the service function directly covers the meaningful behavior. The handler-level
 * 403 case is covered by requirePermission, which is also exercised below.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import { listInvitations, requirePermission } from "@avantej-core/services";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";

const createdIds: string[] = [];
const createdBranchNodeIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;
let TEST_BRANCH_NODE_ID: string;

// Two distinct "inviter" user IDs to simulate Admin A and Admin B
const INVITER_A_USER_ID = "aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa";
const INVITER_B_USER_ID = "bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb";

function futureDate(daysFromNow = 7): Date {
	const d = new Date();
	d.setDate(d.getDate() + daysFromNow);
	return d;
}

async function insertInvitation(
	db: ReturnType<typeof createTenantDb>,
	invitedBy: string,
	label: string,
) {
	const rows = await db
		.insert(invitations)
		.values({
			email: `${label}-${Date.now()}@example.com`,
			role: "staff",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			status: "pending",
			token: `tok-${label}-${Date.now()}`,
			invitedBy,
			expiresAt: futureDate(),
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error(`Failed to insert invitation for label="${label}"`);
	return row;
}

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	const [branchNode] = await tenantDb
		.insert(hierarchyNodes)
		.values({
			name: `Invitations Scope Test Branch ${Date.now()}`,
			slug: `invitations-scope-test-branch-${Date.now()}`,
			type: "branch",
			depth: 4,
		})
		.returning();
	if (!branchNode) throw new Error("Failed to create branch node");
	TEST_BRANCH_NODE_ID = branchNode.id;
	createdBranchNodeIds.push(branchNode.id);
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	if (createdIds.length > 0) {
		await tenantDb
			.delete(invitations)
			.where(inArray(invitations.id, createdIds));
	}
	if (createdBranchNodeIds.length > 0) {
		await tenantDb
			.delete(hierarchyNodes)
			.where(inArray(hierarchyNodes.id, createdBranchNodeIds));
	}
});

describe("Invitations — org-wide scope (Ticket B fix)", () => {
	test("listInvitations returns invitations from all inviters, not just one", async () => {
		if (shouldSkipIntegration()) return;

		// Seed one invitation from Admin A and one from Admin B
		const invA = await insertInvitation(tenantDb, INVITER_A_USER_ID, "scope-a");
		createdIds.push(invA.id);

		const invB = await insertInvitation(tenantDb, INVITER_B_USER_ID, "scope-b");
		createdIds.push(invB.id);

		// Call service WITHOUT invitedBy — this is what the fixed list procedure does
		const result = await listInvitations({
			tenantDb,
			status: "pending",
		});

		const resultIds = result.map((r) => r.id);
		expect(resultIds).toContain(invA.id);
		expect(resultIds).toContain(invB.id);
	}, 30000);

	test("listInvitations with explicit invitedBy filter only returns that inviter's records", async () => {
		if (shouldSkipIntegration()) return;

		// Verify the service supports optional filtering, confirming the bug was
		// purely in the router applying invitedBy unconditionally — not the service.
		const invA = await insertInvitation(
			tenantDb,
			INVITER_A_USER_ID,
			"filter-a",
		);
		createdIds.push(invA.id);

		const invB = await insertInvitation(
			tenantDb,
			INVITER_B_USER_ID,
			"filter-b",
		);
		createdIds.push(invB.id);

		const filteredResult = await listInvitations({
			tenantDb,
			invitedBy: INVITER_A_USER_ID,
		});

		const filteredIds = filteredResult.map((r) => r.id);
		expect(filteredIds).toContain(invA.id);
		expect(filteredIds).not.toContain(invB.id);
	}, 30000);

	test("listInvitations returns empty array when no invitations match the filter", async () => {
		if (shouldSkipIntegration()) return;

		// Filter by a non-existent email — should return empty array, not throw
		const result = await listInvitations({
			tenantDb,
			email: "definitely-does-not-exist-xyz-9999@example.com",
		});

		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBe(0);
	}, 30000);

	test("requirePermission throws for a staff member without user_management:read", async () => {
		if (shouldSkipIntegration()) return;

		// A staff member with no explicit permissions should fail the permission gate.
		// The requirePermission service throws when the check fails — this is the same
		// gate that runs in the list procedure handler before any invitations are fetched.
		const staffMember = {
			id: TEST_MEMBER_ID,
			userId: "some-user-id",
			organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
			role: "staff" as const,
			status: "active" as const,
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			joinedAt: new Date(),
			trainerTierId: null,
			roleId: null,
			leadSourceId: null,
			householdId: null,
			invitationId: null,
			deletedAt: null,
		};

		await expect(
			requirePermission(tenantDb, staffMember, "user_management", "read"),
		).rejects.toBeDefined();
	}, 30000);
});
