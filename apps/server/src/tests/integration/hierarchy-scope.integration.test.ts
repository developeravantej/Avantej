/**
 * Hierarchy branch scope — integration smoke on dev Neon (Plan C.1.3 / C.9).
 *
 * Run: cd apps/server && bun test src/tests/integration/hierarchy-scope.integration.test.ts
 */
import { describe, test, expect, beforeAll } from "bun:test";
import {
	assertBranchAccessible,
	BranchAccessDeniedError,
	resolveScopeNodeIds,
} from "@avantej-core/services";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
} from "../helpers/integration-setup";
import { getDashboardKpis } from "@avantej-core/services/analytics.service";

const OUT_OF_SCOPE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

describe("hierarchy-scope (integration)", () => {
	test("resolveScopeNodeIds rejects out-of-scope scope node", async () => {
		if (shouldSkipIntegration()) return;

		// Guard fires before any DB expansion — no tenantDb access needed.
		await expect(
			resolveScopeNodeIds(tenantDb, OUT_OF_SCOPE, [TEST_BRANCH_NODE_ID]),
		).rejects.toThrow(BranchAccessDeniedError);
	});

	test("resolveScopeNodeIds returns scoped node list when scope omitted", async () => {
		if (shouldSkipIntegration()) return;

		// No scope picked → "All" = the accessible set verbatim (no DB hit).
		const nodes = [TEST_BRANCH_NODE_ID];
		expect(await resolveScopeNodeIds(tenantDb, undefined, nodes)).toEqual(
			nodes,
		);
	});

	test("assertBranchAccessible allows in-scope branch", () => {
		if (shouldSkipIntegration()) return;

		expect(() =>
			assertBranchAccessible(TEST_BRANCH_NODE_ID, [TEST_BRANCH_NODE_ID]),
		).not.toThrow();
	});

	test("analytics getDashboardKpis honors branch filter in scope", async () => {
		if (shouldSkipIntegration()) return;

		const result = await getDashboardKpis(tenantDb, {
			period: "this_month",
			branchId: TEST_BRANCH_NODE_ID,
			accessibleNodeIds: [TEST_BRANCH_NODE_ID],
		});

		expect(result.period).toBe("this_month");
		expect(typeof result.totalSales).toBe("number");
	}, 30000);
});
