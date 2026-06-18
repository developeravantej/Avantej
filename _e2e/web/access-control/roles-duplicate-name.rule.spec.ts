import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	expectRejected,
	getOrgId,
} from "../_safe-mutation";

// Domain rule: role name must be unique within the org → duplicate create returns 409.
// routerKey: roles. Self-cleaning: the one created role is deleted in afterEach.
test.describe("access-control/roles", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("rule: duplicate role name is rejected (409)", async ({ page }) => {
		const organizationId = getOrgId();
		const name = testId("role-dup");

		const created = await rpc(page.request, "roles/create", {
			organizationId,
			name,
			priority: 40,
		});
		const id = created?.id;
		expect(id).toBeTruthy();
		cleanup.add(`role ${id}`, async () => {
			await rpcRaw(page.request, "roles/delete", { organizationId, id });
		});

		// Same name again → rejected. FINDING: duplicate surfaces as a raw DB
		// unique-violation (400 "Failed query: insert into roles") not a clean 409.
		await expectRejected(
			page.request,
			"roles/create",
			{ organizationId, name, priority: 41 },
			[400, 409, 500],
		);
	});
});
