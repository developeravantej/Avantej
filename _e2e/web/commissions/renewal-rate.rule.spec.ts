import { test, expect } from "@playwright/test";
import { getOrgId, rpc } from "../_safe-mutation";

/**
 * UAT §12 — renewal vs new-sale: the commission track carries a `salesType`
 * (new | renewal | any) that the origination engine uses to pay the closer
 * differently on a returning customer vs a new one (see
 * selectTracksBySalesType + planOriginationForOrder).
 *
 * The pure selection logic is unit-tested (commission-sales-type.test.ts). This
 * spec proves the `salesType` dimension round-trips through the live stack:
 * upsertTrack persists it, and an update changes it. The created track is
 * org-scoped with no rates (inert) and is deactivated at the end.
 */
test.describe("§12 commission — renewal vs new-sale (salesType config)", () => {
	test("a track persists and updates its salesType through the API", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const baseTrack = {
			organizationId,
			categoryId: null,
			scope: "org" as const,
			roleType: "sales" as const,
			trigger: "on_sale" as const,
			basis: "gross_order" as const,
			paymentType: "variable" as const,
			poolPolicy: "separate" as const,
			maxBeneficiaries: 1,
		};

		// Create with salesType "renewal".
		const created = await rpc(page.request, "commissionTracks/upsertTrack", {
			...baseTrack,
			salesType: "renewal",
		});
		expect(created?.id, "upsertTrack returns the created track").toBeTruthy();
		expect(created.salesType, "salesType persists as 'renewal' on create").toBe(
			"renewal",
		);

		// Update the same track to salesType "new".
		const updated = await rpc(page.request, "commissionTracks/upsertTrack", {
			...baseTrack,
			id: created.id,
			salesType: "new",
		});
		expect(updated.salesType, "salesType updates to 'new'").toBe("new");

		// Omitting salesType keeps backward-compatible default "any".
		const defaulted = await rpc(page.request, "commissionTracks/upsertTrack", {
			...baseTrack,
			id: created.id,
		});
		expect(defaulted.salesType, "omitted salesType defaults to 'any'").toBe(
			"any",
		);

		// Cleanup: deactivate the test track (it has no rates, so it was inert).
		await rpc(page.request, "commissionTracks/deactivateTrack", {
			organizationId,
			trackId: created.id,
		});
	});
});
