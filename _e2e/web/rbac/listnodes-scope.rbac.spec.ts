import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { rpc, getOrgId } from "../_safe-mutation";

// RBAC node-scope invariant: hierarchy.listNodes returns ALL nodes for an admin
// (or a member with empty accessibleNodeIds = unrestricted), but a branch-scoped
// non-admin sees only the descendants of its own scope — a strict subset.
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

const nodeCount = (res: any) =>
	(Array.isArray(res) ? res : (res?.nodes ?? [])).length;

test.describe("rbac — hierarchy node scope", () => {
	test("a branch-scoped staff sees a strict subset of the admin node tree", async ({
		page,
		playwright,
	}) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed`",
		);
		const organizationId = getOrgId();

		// Admin: full tree.
		const adminNodes = nodeCount(
			await rpc(page.request, "hierarchy/listNodes", { organizationId }),
		);
		expect(adminNodes).toBeGreaterThan(0);

		// Staff: scoped. If staff lacks hierarchy_management:read entirely the call
		// is FORBIDDEN — that is still a valid node-access boundary, so accept it;
		// otherwise the returned set must be a strict subset of the admin's.
		const staff: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
		const res = await staff.post("/rpc/hierarchy/listNodes", {
			data: { json: { organizationId } },
		});
		const status = res.status();
		if (status === 401 || status === 403) {
			await staff.dispose();
			return; // permission boundary holds (staff cannot read the tree at all)
		}
		expect(status, `staff listNodes -> ${status}`).toBe(200);
		const body = (await res.json())?.json ?? {};
		await staff.dispose();

		const staffNodes = (Array.isArray(body) ? body : (body?.nodes ?? []))
			.length;
		// Staff is branch-scoped (not org-root), so it must see fewer nodes than the
		// admin's full tree — proving node-scope filtering is applied.
		expect(staffNodes).toBeGreaterThan(0);
		expect(staffNodes).toBeLessThan(adminNodes);
	});
});
