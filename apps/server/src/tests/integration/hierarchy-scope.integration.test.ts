/**
 * Hierarchy branch scope — integration smoke on dev Neon (Plan C.1.3 / C.9).
 *
 * Run: cd apps/server && bun test src/tests/integration/hierarchy-scope.integration.test.ts
 */
import { describe, test, expect, beforeAll } from "bun:test";
import {
	assertBranchAccessible,
	BranchAccessDeniedError,
	resolveBranchFilter,
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
	test("resolveBranchFilter rejects out-of-scope branchId", () => {
		if (shouldSkipIntegration()) return;

		expect(() =>
			resolveBranchFilter(OUT_OF_SCOPE, [TEST_BRANCH_NODE_ID]),
		).toThrow(BranchAccessDeniedError);
	});

	test("resolveBranchFilter returns scoped branch list when branchId omitted", () => {
		if (shouldSkipIntegration()) return;

		const nodes = [TEST_BRANCH_NODE_ID];
		expect(resolveBranchFilter(undefined, nodes)).toEqual(nodes);
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
