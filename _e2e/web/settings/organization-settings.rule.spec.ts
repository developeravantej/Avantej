import { test, expect } from "@playwright/test";
import { rpc, withRestored, getOrgId } from "../_safe-mutation";

// READ → MODIFY → RESTORE against a real org-settings key (grace_period_days, used by
// the Organization settings page). routerKey: organizationSettings. This is a singleton
// key-value setting, so we NEVER create/leave an E2E row — we restore the original value
// (or a safe numeric default if the key was previously unset) in a finally block.
test.describe("settings/organization", () => {
	test("rule: upsert persists a changed setting, then restore original (no residue)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const key = "grace_period_days";

		await withRestored<string>(
			// READ original (default to "0" if the key was never set — a valid numeric default)
			async () => {
				const got = await rpc(page.request, "organizationSettings/get", {
					organizationId,
					key,
				});
				return (got?.value as string | undefined) ?? "0";
			},
			// RESTORE
			async (original) => {
				await rpc(page.request, "organizationSettings/upsert", {
					organizationId,
					key,
					value: original,
				});
			},
			// BODY: change → assert persisted via re-read
			async () => {
				const changed = "13";
				await rpc(page.request, "organizationSettings/upsert", {
					organizationId,
					key,
					value: changed,
				});
				const after = await rpc(page.request, "organizationSettings/get", {
					organizationId,
					key,
				});
				expect(after?.value).toBe(changed);
			},
		);

		// After restore the changed value must no longer be present.
		const restored = await rpc(page.request, "organizationSettings/get", {
			organizationId,
			key,
		});
		expect(restored?.value).not.toBe("13");
	});
});
