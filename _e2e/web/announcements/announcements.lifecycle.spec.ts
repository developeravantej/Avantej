import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle for announcements: create → update → delete, API-verified.
// routerKey: announcements.
test.describe("announcements", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Announcement lifecycle — create, update, delete (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const title = testId("ann");

		// CREATE
		const created = await rpc(page.request, "announcements/create", {
			organizationId,
			title,
			message: "e2e announcement body",
			priority: "normal",
		});
		const id = created?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`announcement ${id}`, async () => {
			await rpcRaw(page.request, "announcements/delete", {
				organizationId,
				id,
			});
		});

		// ASSERT PRESENT
		const list1 = await rpc(page.request, "announcements/list", {
			organizationId,
		});
		expect(JSON.stringify(list1)).toContain(title);

		// UPDATE
		const title2 = `${title}-edited`;
		await rpc(page.request, "announcements/update", {
			organizationId,
			id,
			title: title2,
			priority: "high",
		});
		const list2 = await rpc(page.request, "announcements/list", {
			organizationId,
		});
		const rows2 = Array.isArray(list2)
			? list2
			: (list2?.items ?? list2?.announcements ?? []);
		const updated = (rows2 as Array<{ id: string }>).find((a) => a.id === id);
		expect((updated as { title?: string })?.title).toBe(title2);

		// DELETE + ASSERT gone-or-deactivated (announcements/delete is a soft delete:
		// the row may remain in the unfiltered list with isActive=false).
		await rpc(page.request, "announcements/delete", { organizationId, id });
		const list3 = await rpc(page.request, "announcements/list", {
			organizationId,
		});
		const rows3 = Array.isArray(list3)
			? list3
			: (list3?.items ?? list3?.announcements ?? []);
		const still = (rows3 as Array<{ id: string; isActive?: boolean }>).find(
			(a) => a.id === id,
		);
		expect(
			!still || still.isActive === false,
			"announcement should be absent or isActive=false after delete",
		).toBeTruthy();
	});
});
