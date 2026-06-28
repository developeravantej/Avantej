/**
 * members.list — hierarchy-scope subtree expansion + branch-isolation guard.
 *
 * Converted from EXACT-EQUALITY (`eq(members.hierarchyScopeId, input.hierarchyScopeId)`)
 * to SUBTREE expansion via `resolveScopeNodeIds`, so picking a non-leaf node
 * (country / region / state) returns its branches' members instead of zero rows.
 *
 * Tests:
 *  1. Out-of-scope guard — a hierarchyScopeId NOT in accessibleNodeIds must throw
 *     FORBIDDEN. The guard short-circuits BEFORE any descendant CTE / row query,
 *     so this passes WITHOUT a live DB.
 *  2. Non-leaf scope expansion — picking a region (with branch descendants)
 *     expands to the subtree and returns the subtree's member rows. The recursive
 *     descendant query (`tenantDb.execute`) and the row query (`select().…`) are
 *     stubbed, so this also runs WITHOUT a live DB.
 *  3. In-scope leaf scope — picking a single accessible branch still passes.
 *
 * Permission uses the admin fast-path: `roles.findFirst → undefined` +
 * `member.role === "admin"` grants `user_management:read` without seeding RBAC.
 *
 * NOTE: depth is ../../ here because this file lives in routers/members/.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { membersListProcedures } from "./list.procedures";
import { createMockContext } from "../../test-utils/mock-context";

// Matches createMockContext's default organizationId so assertOrgContextMatch passes.
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const REGION = "11111111-1111-4111-8111-111111111111"; // non-leaf scope node
const BRANCH_A = "22222222-2222-4222-8222-222222222222"; // child of REGION
const BRANCH_B = "33333333-3333-4333-8333-333333333333"; // child of REGION
const OUT_OF_SCOPE = "99999999-9999-4999-8999-999999999999"; // not accessible

const ADMIN_MEMBER = {
	id: "member-test-1",
	userId: "user-test-1",
	role: "admin" as const,
	status: "active" as const,
	hierarchyScopeId: REGION,
};

/**
 * Build a tenantDb covering exactly what members.list touches AFTER the guard:
 *   - `query.roles.findFirst → undefined` (requirePermission admin fast-path).
 *   - `execute(sql)` → recursive descendant CTE result (`{ rows: [{ id }] }`),
 *     consumed by getDescendantNodeIds inside resolveScopeNodeIds.
 *   - `select().from().where().orderBy()` → member rows (1st call) then the
 *     ghl_user_links enrichment query (2nd call → []).
 *
 * Members are non-`client` (trainer/staff) so the customer_profiles /
 * ghl_contact_links enrichment branch is skipped — no controlPanelDb needed.
 */
function makeListDb({
	descendantIds,
	memberRows,
}: {
	descendantIds: string[];
	memberRows: Array<Record<string, unknown>>;
}) {
	const execute = mock(() =>
		Promise.resolve({ rows: descendantIds.map((id) => ({ id })) }),
	);

	let selectCall = 0;
	const select = mock(() => {
		selectCall += 1;
		const isFirst = selectCall === 1;
		const chain: Record<string, unknown> = {
			from: mock(() => chain),
			where: mock(() => chain),
			// members main query (1st) resolves rows; ghl_user_links query (2nd) → [].
			orderBy: mock(() => Promise.resolve(isFirst ? memberRows : [])),
		};
		return chain;
	});

	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
		execute,
		select,
		__execute: execute,
	} as unknown as never;
}

describe("members.list — branch-scope isolation guard", () => {
	it("throws FORBIDDEN when hierarchyScopeId is outside accessibleNodeIds", async () => {
		// roles.findFirst is needed for the permission fast-path that runs BEFORE
		// the guard; the guard then rejects OUT_OF_SCOPE before any descendant /
		// row query, so no execute/select stub is required.
		const tenantDb = makeListDb({ descendantIds: [], memberRows: [] });
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			member: ADMIN_MEMBER,
			accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
		});

		await expect(
			call(
				membersListProcedures.list,
				{ organizationId: ORG_ID, hierarchyScopeId: OUT_OF_SCOPE },
				{ context },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("members.list — non-leaf scope subtree expansion", () => {
	it("expands a region scope to its subtree and returns the subtree's members", async () => {
		// REGION expands (via the recursive CTE stub) to its two branch children;
		// members in BOTH branches must be returned, not zero.
		const memberRows = [
			{
				id: "m-a",
				userId: "u-a",
				role: "trainer",
				roleId: null,
				hierarchyScopeId: BRANCH_A,
				status: "active",
				joinedAt: new Date(),
				trainerTierId: null,
				deletedAt: null,
			},
			{
				id: "m-b",
				userId: "u-b",
				role: "staff",
				roleId: null,
				hierarchyScopeId: BRANCH_B,
				status: "active",
				joinedAt: new Date(),
				trainerTierId: null,
				deletedAt: null,
			},
		];
		const tenantDb = makeListDb({
			descendantIds: [REGION, BRANCH_A, BRANCH_B],
			memberRows,
		});
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			member: ADMIN_MEMBER,
			accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
		});

		const result = await call(
			membersListProcedures.list,
			{ organizationId: ORG_ID, hierarchyScopeId: REGION },
			{ context },
		);

		// The recursive descendant CTE was actually invoked (subtree expansion).
		expect(
			(tenantDb as unknown as { __execute: { mock: { calls: unknown[] } } })
				.__execute.mock.calls.length,
		).toBe(1);
		// Both branches' members surfaced — a non-leaf scope no longer returns [].
		expect(result.map((r) => r.id).sort()).toEqual(["m-a", "m-b"]);
		expect(result.map((r) => r.hierarchyScopeId).sort()).toEqual([
			BRANCH_A,
			BRANCH_B,
		]);
	});

	it("passes for an in-scope leaf branch scope", async () => {
		const memberRows = [
			{
				id: "m-a",
				userId: "u-a",
				role: "trainer",
				roleId: null,
				hierarchyScopeId: BRANCH_A,
				status: "active",
				joinedAt: new Date(),
				trainerTierId: null,
				deletedAt: null,
			},
		];
		// A leaf node expands to just itself.
		const tenantDb = makeListDb({
			descendantIds: [BRANCH_A],
			memberRows,
		});
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			member: ADMIN_MEMBER,
			accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
		});

		const result = await call(
			membersListProcedures.list,
			{ organizationId: ORG_ID, hierarchyScopeId: BRANCH_A },
			{ context },
		);

		expect(result.map((r) => r.id)).toEqual(["m-a"]);
	});
});
