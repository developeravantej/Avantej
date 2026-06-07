import { test, expect } from "@playwright/test";
import { rpc, getOrgId, expectRejected } from "../_safe-mutation";

// Notifications are scoped to the session user.
test.describe("notifications — per-user scoping", () => {
	test("markRead on a notification id the user does not own → NOT_FOUND", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		// A well-formed but non-owned id must not be markable by this user.
		await expectRejected(
			page.request,
			"notifications/markRead",
			{ organizationId, id: "00000000-0000-0000-0000-000000000000" },
			[404],
		);
	});

	test("markRead marks an owned unread notification as read (if any exist)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const res = await rpc(page.request, "notifications/list", {
			organizationId,
			isRead: false,
			limit: 5,
		});
		const list = Array.isArray(res) ? res : (res?.items ?? res?.rows ?? []);
		test.skip(list.length === 0, "no unread notification to mark");

		const target = list[0];
		await rpc(page.request, "notifications/markRead", {
			organizationId,
			id: target.id,
		});

		// Re-read: the notification should no longer be in the unread set.
		const after = await rpc(page.request, "notifications/list", {
			organizationId,
			isRead: false,
			limit: 50,
		});
		const afterList = Array.isArray(after)
			? after
			: (after?.items ?? after?.rows ?? []);
		expect(afterList.some((n: any) => n.id === target.id)).toBe(false);
	});
});
