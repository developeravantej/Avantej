import { test, expect } from "@playwright/test";
import { withRestored, rpc, getOrgId } from "../_safe-mutation";

// customerProfiles.upsert is SELF-SCOPED to the session user (the admin running
// these E2E tests). It has no "create" — it upserts the caller's own profile row.
// We therefore exercise the lifecycle as read -> modify -> restore on the admin's
// OWN profile (never touching another tenant member), so nothing is left dirty.
//
// The admin-scoped variants (upsertForCustomer / softDelete / restore) and the
// households add/remove flows require a pre-existing `client` member + customer
// profile that cannot be safely created from here — see the .rule.spec files and
// the SKIP notes in the agent report.
test.describe("customer-profiles", () => {
	test("Self profile upsert — update a field then restore (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const marker = `E2E-DEEP notes ${Date.now()}`;

		await withRestored(
			// READ current self profile (may be null if never set)
			async () => {
				const cur = await rpc(page.request, "customerProfiles/get", {
					organizationId,
				});
				return cur?.notes ?? null;
			},
			// RESTORE original notes value
			async (originalNotes) => {
				await rpc(page.request, "customerProfiles/upsert", {
					organizationId,
					notes: originalNotes,
				});
			},
			// BODY: write a marker, re-query, assert it persisted
			async () => {
				const updated = await rpc(page.request, "customerProfiles/upsert", {
					organizationId,
					notes: marker,
				});
				expect(updated?.notes).toBe(marker);

				const got = await rpc(page.request, "customerProfiles/get", {
					organizationId,
				});
				expect(got?.notes).toBe(marker);
			},
		);

		// After restore, the marker is gone again.
		const after = await rpc(page.request, "customerProfiles/get", {
			organizationId,
		});
		expect(after?.notes ?? null).not.toBe(marker);
	});
});
