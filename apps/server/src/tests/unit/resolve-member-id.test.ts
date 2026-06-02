/**
 * Unit tests for resolveMemberIdFromUserId (appointment.service.ts).
 *
 * resolveMemberIdFromUserId(tenantDb, userId) resolves a member's tenant DB primary key (members.id)
 * from their control-panel userId (members.userId). It does:
 *   tenantDb.select({ id: members.id }).from(members).where(eq(members.userId, userId)).limit(1)
 * and returns row?.id ?? null.
 *
 * Two cases:
 *   1. Valid userId — DB returns [{ id: "uuid-members-id" }]  → should return "uuid-members-id"
 *   2. Unknown userId — DB returns []                         → should return null
 */

import { describe, test, expect, mock } from "bun:test";
import { resolveMemberIdFromUserId } from "@avantej-core/services";

// ---------------------------------------------------------------------------
// Mock DB builder for select chain
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock tenantDb that supports the select chain used by resolveMemberIdFromUserId:
 *   .select().from().where().limit()
 * The chain is thenable so `await db.select(...).from(...).where(...).limit(1)` resolves.
 */
function buildMockDb(selectResult: { id: string }[]) {
	function makeChain(result: unknown): Record<string, unknown> {
		const chain: Record<string, unknown> = {
			from: mock(() => chain),
			where: mock(() => chain),
			limit: mock(() => Promise.resolve(result)),
			then: (resolve: (v: unknown) => unknown) =>
				Promise.resolve(result).then(resolve),
		};
		return chain;
	}

	return {
		select: mock(() => makeChain(selectResult)),
	} as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveMemberIdFromUserId", () => {
	test("valid userId returns members.id", async () => {
		const MEMBER_TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
		const CONTROL_PANEL_USER_ID = "user-ccc-111";

		const mockDb = buildMockDb([{ id: MEMBER_TENANT_ID }]);

		const result = await resolveMemberIdFromUserId(
			mockDb,
			CONTROL_PANEL_USER_ID,
		);

		expect(result).toBe(MEMBER_TENANT_ID);
	});

	test("unknown userId returns null", async () => {
		const UNKNOWN_USER_ID = "user-does-not-exist";

		const mockDb = buildMockDb([]);

		const result = await resolveMemberIdFromUserId(mockDb, UNKNOWN_USER_ID);

		expect(result).toBeNull();
	});
});
