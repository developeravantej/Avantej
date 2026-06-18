import { test, expect } from "@playwright/test";
import { rpc, expectRejected, getOrgId } from "../_safe-mutation";

// Domain rule: system roles (isSystem=true) cannot be updated or deleted → 400 BAD_REQUEST.
// routerKey: roles. No mutation persists (the system role is never modified).
test.describe("access-control/roles", () => {
	test("rule: updating or deleting a system role is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const list = await rpc(page.request, "roles/list", { organizationId });
		const systemRole = (Array.isArray(list) ? list : []).find(
			(r: { isSystem?: boolean }) => r.isSystem === true,
		);
		expect(
			systemRole?.id,
			`expected at least one system role; got: ${JSON.stringify(list)}`,
		).toBeTruthy();

		// update a system role → 400
		await expectRejected(
			page.request,
			"roles/update",
			{ organizationId, id: systemRole.id, name: "E2E-DEEP-should-not-apply" },
			[400],
		);

		// delete a system role → 400
		await expectRejected(
			page.request,
			"roles/delete",
			{ organizationId, id: systemRole.id },
			[400],
		);

		// confirm the system role is untouched
		const after = await rpc(page.request, "roles/list", { organizationId });
		const still = (Array.isArray(after) ? after : []).find(
			(r: { id: string }) => r.id === systemRole.id,
		);
		expect(still?.name).toBe(systemRole.name);
	});
});
