import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
} from "../_safe-mutation";

// Deep lifecycle, API-driven + API-verified, self-cleaning.
// services/create requires name, duration, maxAttendees. There is no hard
// delete (only create/update/duplicate) — "removal" is isActive:false.
test.describe("service", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Service lifecycle — create, update, deactivate (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);
		const name = testId("service");

		// CREATE
		const created = await rpc(page.request, "services/create", {
			organizationId,
			branchId,
			name,
			duration: 60,
			maxAttendees: 1,
		});
		const id = created?.id ?? created?.service?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`service ${id}`, async () => {
			await rpcRaw(page.request, "services/update", {
				organizationId,
				branchId,
				id,
				isActive: false,
			});
		});

		// ASSERT PRESENT
		const got = await rpc(page.request, "services/getById", {
			organizationId,
			id,
		});
		expect(got?.name).toBe(name);
		expect(got?.duration).toBe(60);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "services/update", {
			organizationId,
			branchId,
			id,
			name: name2,
			duration: 90,
		});
		const got2 = await rpc(page.request, "services/getById", {
			organizationId,
			id,
		});
		expect(got2?.name).toBe(name2);
		expect(got2?.duration).toBe(90);

		// DEACTIVATE + ASSERT not in active list
		await rpc(page.request, "services/update", {
			organizationId,
			branchId,
			id,
			isActive: false,
		});
		const activeList = await rpc(page.request, "services/list", {
			organizationId,
			isActive: true,
		});
		expect(JSON.stringify(activeList)).not.toContain(name2);
	});
});
