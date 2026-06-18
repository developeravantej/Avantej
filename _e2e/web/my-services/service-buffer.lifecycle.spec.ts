import { test, expect } from "@playwright/test";
import { rpc, getOrgId } from "../_safe-mutation";

// serviceMembers.updateMyBuffer is SELF-scoped: it sets/clears the calling
// member's per-service buffer override (member_service_buffer_overrides).
// We exercise it only against a service the caller is already assigned to
// (discovered via serviceMembers.listMine). We capture the original override,
// set a marker value, assert, then restore the original (null clears it).
// If the caller is assigned to no services, there is nothing to buffer -> skip.
test.describe("my-services / service buffer", () => {
	test("updateMyBuffer — set then restore my override for an assigned service", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const mine = await rpc(page.request, "serviceMembers/listMine", {
			organizationId,
		});
		const rows = Array.isArray(mine) ? mine : [];
		const assigned = rows[0];

		test.skip(
			!assigned?.serviceId,
			"caller is not assigned to any service — no self buffer to set",
		);

		const serviceId = assigned.serviceId as string;
		const original: number | null = assigned.bufferTimeMinutes ?? null;
		const marker = 17; // distinctive, within 0..480

		try {
			// SET marker override
			const set = await rpc(page.request, "serviceMembers/updateMyBuffer", {
				organizationId,
				serviceId,
				bufferTimeMinutes: marker,
			});
			expect(set?.bufferTimeMinutes).toBe(marker);

			// VERIFY via re-query
			const after = await rpc(page.request, "serviceMembers/listMine", {
				organizationId,
			});
			const row = (after as any[]).find((r) => r.serviceId === serviceId);
			expect(row?.bufferTimeMinutes).toBe(marker);

			// CLEAR (null) -> override removed
			const cleared = await rpc(page.request, "serviceMembers/updateMyBuffer", {
				organizationId,
				serviceId,
				bufferTimeMinutes: null,
			});
			expect(cleared?.bufferTimeMinutes).toBeNull();
		} finally {
			// RESTORE the caller's original override exactly (null clears it again).
			await rpc(page.request, "serviceMembers/updateMyBuffer", {
				organizationId,
				serviceId,
				bufferTimeMinutes: original,
			}).catch(() => {});
		}
	});
});
