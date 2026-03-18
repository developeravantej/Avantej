import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_USER_ID,
} from "../helpers/integration-setup";
import { deactivateMember } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";

const createdMemberIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || createdMemberIds.length === 0) return;
	// Restore test members to active status and clean up
	for (const id of createdMemberIds) {
		try {
			await tenantDb
				.delete(members)
				.where(eq(members.id, id));
		} catch {
			// Ignore cleanup errors
		}
	}
});

/**
 * Helper to create a test member directly in the tenant DB.
 * Uses a unique userId to avoid conflicts.
 */
async function createTestMember(
	db: typeof tenantDb,
	overrides: Partial<typeof members.$inferInsert> = {},
) {
	const [member] = await db
		.insert(members)
		.values({
			userId: `test-user-deactivate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			role: "staff",
			status: "active",
			hierarchyScopeId: null,
			...overrides,
		})
		.returning();

	if (!member) {
		throw new Error("Failed to create test member");
	}
	return member;
}

describe("Members Deactivate Integration", () => {
	test("deactivate sets status to 'inactive' (not 'suspended')", async () => {
		if (shouldSkipIntegration()) return;

		const testMember = await createTestMember(tenantDb, {
			role: "staff",
			status: "active",
		});
		createdMemberIds.push(testMember.id);

		expect(testMember.status).toBe("active");

		// Deactivate
		const updated = await deactivateMember(tenantDb, testMember.id);

		// CRITICAL: Status should be 'inactive', NOT 'suspended'
		expect(updated.status).toBe("inactive");
		expect(updated.status).not.toBe("suspended");

		// Verify by re-reading from DB
		const [fromDb] = await tenantDb
			.select()
			.from(members)
			.where(eq(members.id, testMember.id));

		expect(fromDb.status).toBe("inactive");
	}, 30000);

	test("deactivate non-existent member throws error", async () => {
		if (shouldSkipIntegration()) return;

		const fakeId = "00000000-0000-4000-8000-000000000099";

		await expect(deactivateMember(tenantDb, fakeId)).rejects.toThrow(
			`Member not found: ${fakeId}`,
		);
	}, 15000);

	test("deactivate already-inactive member still succeeds", async () => {
		if (shouldSkipIntegration()) return;

		const testMember = await createTestMember(tenantDb, {
			role: "staff",
			status: "active",
		});
		createdMemberIds.push(testMember.id);

		// Deactivate first time
		await deactivateMember(tenantDb, testMember.id);

		// Deactivate second time - should still succeed (idempotent)
		const updated = await deactivateMember(tenantDb, testMember.id);
		expect(updated.status).toBe("inactive");
	}, 30000);

	test("deactivate preserves other member fields", async () => {
		if (shouldSkipIntegration()) return;

		const testMember = await createTestMember(tenantDb, {
			role: "admin",
			status: "active",
		});
		createdMemberIds.push(testMember.id);

		const deactivated = await deactivateMember(tenantDb, testMember.id);

		// Role and other fields should be preserved
		expect(deactivated.role).toBe("admin");
		expect(deactivated.userId).toBe(testMember.userId);
		expect(deactivated.id).toBe(testMember.id);
	}, 30000);
});
