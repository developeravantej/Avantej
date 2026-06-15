import { test, expect } from "@playwright/test";
import { rpc, expectRejected, getOrgId } from "../_safe-mutation";

// Domain rule: permissions on a system role cannot be removed → 400 BAD_REQUEST.
// routerKey: rolePermissions. No mutation persists (the system role is untouched).
test.describe("access-control/role-permissions", () => {
	test("rule: removing a permission from a system role is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const roles = await rpc(page.request, "roles/list", { organizationId });
		const systemRole = (Array.isArray(roles) ? roles : []).find(
			(r: { isSystem?: boolean }) => r.isSystem === true,
		);
		expect(systemRole?.id, `expected at least one system role`).toBeTruthy();

		const perms = await rpc(page.request, "permissions/list", {
			organizationId,
		});
		const permissionId = (Array.isArray(perms) ? perms : [])[0]?.id;
		expect(permissionId, `expected at least one permission`).toBeTruthy();

		// remove on a system role → 400 (rejected before touching anything)
		await expectRejected(
			page.request,
			"rolePermissions/remove",
			{ organizationId, roleId: systemRole.id, permissionId },
			[400],
		);
	});
});
