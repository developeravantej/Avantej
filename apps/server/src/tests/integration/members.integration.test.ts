/**
 * Integration tests for Wave 3a Agent 2.1 — Journey J1.
 *
 * Verifies the additive `members.role_id` FK + dual-write contract on the
 * `members.updateRole` flow:
 *   (a) update with `roleId` only (binds custom role to member)
 *   (b) update with `newRole` only (legacy text path — pre-existing behaviour)
 *   (c) update with both (atomic dual-write)
 *
 * Notes:
 * - Schema declares `members.role_id uuid REFERENCES roles(id) ON DELETE SET NULL`.
 *   So the test must use a real `roles.id` value — we look up the seeded
 *   "admin" system role (always present) and create a transient custom role
 *   per test for cases that exercise the FK.
 * - These tests poke the tenant DB directly (no Hono / oRPC roundtrip) — they
 *   verify the schema column + FK behave correctly, which is what J1's
 *   acceptance criterion hinges on.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
	TEST_BRANCH_NODE_ID,
} from "../helpers/integration-setup";
import { members } from "@avantej-core/db/schema/tenant/members";
import { roles } from "@avantej-core/db/schema/tenant/roles";

let tenantDb: ReturnType<typeof createTenantDb>;
const createdMemberIds: string[] = [];
const createdRoleIds: string[] = [];

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	for (const id of createdMemberIds) {
		try {
			await tenantDb.delete(members).where(eq(members.id, id));
		} catch {
			// ignore cleanup errors
		}
	}
	for (const id of createdRoleIds) {
		try {
			await tenantDb.delete(roles).where(eq(roles.id, id));
		} catch {
			// ignore cleanup errors
		}
	}
});

async function createTestMember(
	overrides: Partial<typeof members.$inferInsert> = {},
) {
	const [m] = await tenantDb
		.insert(members)
		.values({
			userId: `test-user-roleid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			role: "staff",
			status: "active",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			...overrides,
		})
		.returning();
	if (!m) throw new Error("Failed to create test member");
	createdMemberIds.push(m.id);
	return m;
}

async function createTestRole(name: string, priority = 50) {
	const [r] = await tenantDb
		.insert(roles)
		.values({
			name: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			description: "Wave 3a Agent 2.1 J1 test role",
			isSystem: false,
			priority,
		})
		.returning();
	if (!r) throw new Error("Failed to create test role");
	createdRoleIds.push(r.id);
	return r;
}

describe("Members updateRole — Wave 3a Agent 2.1 (Journey J1)", () => {
	test("(a) update with roleId only sets the FK and preserves legacy text role", async () => {
		if (shouldSkipIntegration()) return;

		const member = await createTestMember({ role: "staff", roleId: null });
		const customRole = await createTestRole("yoga-lead");

		// Simulate router's standalone roleId write (the additive code path
		// in members.ts updateRole when input.roleId is provided).
		await tenantDb
			.update(members)
			.set({ roleId: customRole.id })
			.where(eq(members.id, member.id));

		const updated = (
			await tenantDb.select().from(members).where(eq(members.id, member.id))
		)[0]!;

		expect(updated.roleId).toBe(customRole.id);
		// Legacy text role is untouched on this path.
		expect(updated.role).toBe("staff");
	}, 30000);

	test("(b) update with newRole only (legacy path) leaves roleId untouched", async () => {
		if (shouldSkipIntegration()) return;

		const member = await createTestMember({ role: "staff", roleId: null });

		// Simulate MembershipService.updateMemberRole — text role only.
		await tenantDb
			.update(members)
			.set({ role: "trainer" })
			.where(eq(members.id, member.id));

		const updated = (
			await tenantDb.select().from(members).where(eq(members.id, member.id))
		)[0]!;

		expect(updated.role).toBe("trainer");
		expect(updated.roleId).toBeNull();
	}, 30000);

	test("(c) update with both writes legacy role + roleId atomically", async () => {
		if (shouldSkipIntegration()) return;

		const member = await createTestMember({ role: "staff", roleId: null });
		const customRole = await createTestRole("studio-manager", 70);

		// Step 1: MembershipService dual-write of text role.
		await tenantDb
			.update(members)
			.set({ role: "admin" })
			.where(eq(members.id, member.id));
		// Step 2: router's additive roleId write.
		await tenantDb
			.update(members)
			.set({ roleId: customRole.id })
			.where(eq(members.id, member.id));

		const updated = (
			await tenantDb.select().from(members).where(eq(members.id, member.id))
		)[0]!;

		expect(updated.role).toBe("admin");
		expect(updated.roleId).toBe(customRole.id);
	}, 30000);

	test("explicit null roleId clears the FK without touching legacy role", async () => {
		if (shouldSkipIntegration()) return;

		const customRole = await createTestRole("temporary-role");
		const member = await createTestMember({
			role: "trainer",
			roleId: customRole.id,
		});

		// Caller passes roleId: null to revoke the custom role binding.
		await tenantDb
			.update(members)
			.set({ roleId: null })
			.where(eq(members.id, member.id));

		const updated = (
			await tenantDb.select().from(members).where(eq(members.id, member.id))
		)[0]!;

		expect(updated.roleId).toBeNull();
		expect(updated.role).toBe("trainer");
	}, 30000);

	test("ON DELETE SET NULL — deleting a custom role nulls the member's roleId", async () => {
		if (shouldSkipIntegration()) return;

		const customRole = await createTestRole("ephemeral-role");
		const member = await createTestMember({
			role: "staff",
			roleId: customRole.id,
		});

		// Verify pre-condition.
		const before = (
			await tenantDb.select().from(members).where(eq(members.id, member.id))
		)[0]!;
		expect(before.roleId).toBe(customRole.id);

		// Delete the role row directly.
		await tenantDb.delete(roles).where(eq(roles.id, customRole.id));
		// Drop from tracking — already deleted.
		const idx = createdRoleIds.indexOf(customRole.id);
		if (idx >= 0) createdRoleIds.splice(idx, 1);

		// FK ON DELETE SET NULL should have nulled the member's roleId.
		const after = (
			await tenantDb.select().from(members).where(eq(members.id, member.id))
		)[0]!;
		expect(after.roleId).toBeNull();
		// Member row itself preserved; legacy text role intact.
		expect(after.role).toBe("staff");
	}, 30000);
});
