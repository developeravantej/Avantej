import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
} from "../_safe-mutation";

// Deep CRUD lifecycle, API-driven + API-verified, self-cleaning.
// rooms/create requires name, type (enum), capacity, branchId.
test.describe("rooms", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Room lifecycle — create, update, delete (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);
		const name = testId("room");

		// CREATE
		const created = await rpc(page.request, "rooms/create", {
			organizationId,
			name,
			type: "private",
			capacity: 4,
			branchId,
		});
		const id = created?.id ?? created?.room?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`room ${id}`, async () => {
			await rpcRaw(page.request, "rooms/delete", { organizationId, id });
		});

		// ASSERT PRESENT
		const got = await rpc(page.request, "rooms/getById", {
			organizationId,
			id,
		});
		expect(got?.name).toBe(name);
		expect(got?.capacity).toBe(4);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "rooms/update", {
			organizationId,
			id,
			name: name2,
			capacity: 8,
		});
		const got2 = await rpc(page.request, "rooms/getById", {
			organizationId,
			id,
		});
		expect(got2?.name).toBe(name2);
		expect(got2?.capacity).toBe(8);

		// DELETE (soft: deleteRoom sets isActive=false) + ASSERT deactivated
		await rpc(page.request, "rooms/delete", { organizationId, id });
		const after = await rpc(page.request, "rooms/getById", {
			organizationId,
			id,
		});
		expect(
			after?.isActive,
			"rooms/delete is a soft delete — row remains with isActive=false",
		).toBe(false);
	});
});
