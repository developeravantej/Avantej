import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { rpc, getOrgId, expectForbidden } from "../_safe-mutation";

/**
 * UAT §13 — Reporting permission controls (BLOCKER-grade).
 *
 * "A report leaking another coach's clients or another location's figures is a
 * Launch Blocker." This asserts a branch-scoped staff role cannot pull an
 * analytics report (getDashboardKpis) for an out-of-scope location — the API
 * returns 401/403 (either reports:read permission denied, or branch-scope guard).
 */
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("§13 reporting — permission controls", () => {
	test("branch-scoped staff cannot pull a report for an out-of-scope location", async ({
		page,
		playwright,
	}) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed`",
		);
		const organizationId = getOrgId();

		// Admin: enumerate branches.
		const adminNodes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const adminList = Array.isArray(adminNodes)
			? adminNodes
			: (adminNodes?.nodes ?? []);
		const adminBranches = adminList.filter((n: any) => n.type === "branch");
		expect(adminBranches.length, "need at least one branch").toBeGreaterThan(0);

		// Staff scope (branches the staff CAN see).
		const staff: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
		const sRes = await staff.post("/rpc/hierarchy/listNodes", {
			data: { json: { organizationId } },
		});
		const staffBranchIds = new Set<string>();
		if (sRes.status() === 200) {
			const body = (await sRes.json())?.json ?? {};
			const arr = Array.isArray(body) ? body : (body?.nodes ?? []);
			for (const n of arr) if (n.type === "branch") staffBranchIds.add(n.id);
		}

		// An out-of-scope branch = an admin branch the staff cannot see.
		const outOfScope =
			adminBranches.find((b: any) => !staffBranchIds.has(b.id)) ??
			adminBranches[0];
		expect(outOfScope?.id, "no out-of-scope branch found").toBeTruthy();

		// BLOCKER invariant: report for an out-of-scope location is forbidden.
		await expectForbidden(staff, "analytics/getDashboardKpis", {
			organizationId,
			period: "this_month",
			branchId: outOfScope.id,
		});

		await staff.dispose();
	});
});
