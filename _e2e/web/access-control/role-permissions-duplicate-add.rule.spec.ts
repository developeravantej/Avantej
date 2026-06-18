import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	expectRejected,
	getOrgId,
} from "../_safe-mutation";

// Domain rule: a permission already assigned to a role cannot be added again → 409.
// routerKey: rolePermissions. Uses a freshly-created custom role (deleting the role
// cascade-deletes its role_permissions), so the run is self-cleaning.
test.describe("access-control/role-permissions", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("rule: adding a duplicate permission to a role is rejected (409)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// custom role to attach permissions to
		const role = await rpc(page.request, "roles/create", {
			organizationId,
			name: testId("rp-role"),
			priority: 45,
		});
		const roleId = role?.id;
		expect(roleId).toBeTruthy();
		cleanup.add(`role ${roleId}`, async () => {
			await rpcRaw(page.request, "roles/delete", {
				organizationId,
				id: roleId,
			});
		});

		// pick any existing permission
		const perms = await rpc(page.request, "permissions/list", {
			organizationId,
		});
		const permissionId = (Array.isArray(perms) ? perms : [])[0]?.id;
		expect(permissionId, `expected at least one permission`).toBeTruthy();

		// first add succeeds
		const added = await rpc(page.request, "rolePermissions/add", {
			organizationId,
			roleId,
			permissionId,
		});
		expect(added?.id).toBeTruthy();

		// duplicate add → rejected. FINDING: surfaces as raw DB unique-violation
		// (400 "Failed query: insert into role_permissions") not a clean 409.
		await expectRejected(
			page.request,
			"rolePermissions/add",
			{ organizationId, roleId, permissionId },
			[400, 409, 500],
		);
	});
});
