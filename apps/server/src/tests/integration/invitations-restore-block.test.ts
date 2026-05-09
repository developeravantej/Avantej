/**
 * Integration tests for the soft-deleted customer block on invitations.create.
 *
 * Verifies that checkSoftDeletedCustomerBlock correctly identifies and blocks
 * re-invitation of a previously-soft-deleted customer, while allowing:
 * - Genuinely new emails (no control-panel user) → not blocked
 * - Existing users without a client member record → not blocked
 * - Existing client members that are NOT deleted → not blocked
 *
 * TDD: write failing tests first, then implement the helper.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	createControlPanelDb,
} from "../helpers/integration-setup";
import { checkSoftDeletedCustomerBlock } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { inArray } from "drizzle-orm";

// Unique suffix per test run to avoid collisions
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Track IDs for cleanup
const createdControlPanelUserIds: string[] = [];
const createdTenantMemberIds: string[] = [];
const createdCustomerProfileIds: string[] = [];
const createdHierarchyNodeIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;
let controlPanelDb: ReturnType<typeof createControlPanelDb>;
let testHierarchyNodeId: string;

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
	controlPanelDb = createControlPanelDb();

	// Create a hierarchy node to satisfy the members FK
	const [node] = await tenantDb
		.insert(hierarchyNodes)
		.values({
			name: `RestoreBlock Test Node ${RUN_ID}`,
			type: "branch",
			depth: 4,
		})
		.returning();
	if (!node) throw new Error("Failed to create test hierarchy node");
	testHierarchyNodeId = node.id;
	createdHierarchyNodeIds.push(node.id);
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;

	// Cleanup in dependency order: profiles, members, then hierarchy nodes, then users
	if (createdCustomerProfileIds.length > 0) {
		await tenantDb
			.delete(customerProfiles)
			.where(inArray(customerProfiles.id, createdCustomerProfileIds));
	}
	if (createdTenantMemberIds.length > 0) {
		await tenantDb
			.delete(members)
			.where(inArray(members.id, createdTenantMemberIds));
	}
	if (createdHierarchyNodeIds.length > 0) {
		await tenantDb
			.delete(hierarchyNodes)
			.where(inArray(hierarchyNodes.id, createdHierarchyNodeIds));
	}
	if (createdControlPanelUserIds.length > 0) {
		await controlPanelDb
			.delete(userTable)
			.where(inArray(userTable.id, createdControlPanelUserIds));
	}
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function seedControlPanelUser(emailSuffix: string) {
	const id = `test-rbtest-${RUN_ID}-${emailSuffix}`;
	const email = `restore-block-${RUN_ID}-${emailSuffix}@example.com`;
	const now = new Date();
	const [row] = await controlPanelDb
		.insert(userTable)
		.values({
			id,
			name: "Test User",
			email,
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!row) throw new Error(`Failed to seed control-panel user: ${email}`);
	createdControlPanelUserIds.push(id);
	return { id, email };
}

async function seedTenantMember(
	userId: string,
	role: "client" | "staff" | "admin" | "trainer",
) {
	const [row] = await tenantDb
		.insert(members)
		.values({
			userId,
			role,
			hierarchyScopeId: testHierarchyNodeId,
			status: "active",
		})
		.returning();
	if (!row) throw new Error(`Failed to seed member for userId: ${userId}`);
	createdTenantMemberIds.push(row.id);
	return row;
}

async function seedCustomerProfile(userId: string, isDeleted: boolean) {
	const [row] = await tenantDb
		.insert(customerProfiles)
		.values({
			userId,
			isDeleted,
			deletedAt: isDeleted ? new Date() : null,
		})
		.returning();
	if (!row) throw new Error(`Failed to seed customer profile for userId: ${userId}`);
	createdCustomerProfileIds.push(row.id);
	return row;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("checkSoftDeletedCustomerBlock", () => {
	test(
		"[CASE 1 — CORE RED] blocks when user is a soft-deleted client in this tenant",
		async () => {
			if (shouldSkipIntegration()) return;

			// Seed: control-panel user
			const { id: userId, email } = await seedControlPanelUser("deleted-client");

			// Seed: tenant client member
			await seedTenantMember(userId, "client");

			// Seed: soft-deleted customer_profile
			const profile = await seedCustomerProfile(userId, true /* isDeleted */);

			const result = await checkSoftDeletedCustomerBlock({
				tenantDb,
				controlPanelDb,
				email,
			});

			expect(result.blocked).toBe(true);
			if (result.blocked) {
				expect(result.userId).toBe(userId);
				expect(result.profileId).toBe(profile.id);
			}
		},
		30000,
	);

	test(
		"[CASE 2] does NOT block when no control-panel user exists for email (genuinely new)",
		async () => {
			if (shouldSkipIntegration()) return;

			const result = await checkSoftDeletedCustomerBlock({
				tenantDb,
				controlPanelDb,
				email: `totally-new-never-seen-${RUN_ID}@example.com`,
			});

			expect(result.blocked).toBe(false);
		},
		30000,
	);

	test(
		"[CASE 3] does NOT block when user exists but has no client member record",
		async () => {
			if (shouldSkipIntegration()) return;

			const { email } = await seedControlPanelUser("no-member");

			// NO member row for this user

			const result = await checkSoftDeletedCustomerBlock({
				tenantDb,
				controlPanelDb,
				email,
			});

			expect(result.blocked).toBe(false);
		},
		30000,
	);

	test(
		"[CASE 4] does NOT block when user is a client member but customer_profile is NOT deleted",
		async () => {
			if (shouldSkipIntegration()) return;

			const { id: userId, email } = await seedControlPanelUser("active-client");

			await seedTenantMember(userId, "client");
			await seedCustomerProfile(userId, false /* isDeleted = false */);

			const result = await checkSoftDeletedCustomerBlock({
				tenantDb,
				controlPanelDb,
				email,
			});

			expect(result.blocked).toBe(false);
		},
		30000,
	);

	test(
		"[CASE 5] does NOT block when user exists as staff (not client) even if somehow deleted",
		async () => {
			if (shouldSkipIntegration()) return;

			const { id: userId, email } = await seedControlPanelUser("staff-user");

			// Staff member, not client — check should not block
			await seedTenantMember(userId, "staff");

			const result = await checkSoftDeletedCustomerBlock({
				tenantDb,
				controlPanelDb,
				email,
			});

			expect(result.blocked).toBe(false);
		},
		30000,
	);
});
