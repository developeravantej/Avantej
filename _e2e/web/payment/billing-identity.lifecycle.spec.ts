import { test, expect } from "@playwright/test";
import { rpc, getOrgId, testId, withRestored } from "../_safe-mutation";
import { waitForWithReload } from "../_helpers";

/**
 * Billing identity (org_billing_profile singleton) — read→modify→restore.
 *
 * The profile is a singleton (can't create/delete), so the lifecycle is:
 * snapshot current values → write test-prefixed values → assert they flow onto
 * the printable invoice at BOTH boundaries (getPrintView payload AND the
 * rendered /print/invoice page) → restore the snapshot in finally.
 */
test.describe("billing identity — flows onto printed documents", () => {
	test("update propagates to invoice print view (API + UI), then restores", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const list = await rpc(page.request, "invoices/list", { organizationId });
		const invoices = Array.isArray(list) ? list : (list?.invoices ?? []);
		test.skip(invoices.length === 0, "no invoices to render the identity on");
		const inv = invoices[0];

		const legalName = testId("LEGAL").toUpperCase();
		const regNo = "0000000-E2E";

		await withRestored(
			// read: snapshot the singleton (null when never configured)
			async () => rpc(page.request, "billingProfile/get", { organizationId }),
			// write: restore exactly what was there (nulls clear the fields)
			async (original) => {
				await rpc(page.request, "billingProfile/update", {
					organizationId,
					legalName: original?.legalName ?? null,
					registrationNo: original?.registrationNo ?? null,
					address: original?.address ?? null,
					footerNote: original?.footerNote ?? null,
				});
			},
			async () => {
				// MODIFY
				const updated = await rpc(page.request, "billingProfile/update", {
					organizationId,
					legalName,
					registrationNo: regNo,
				});
				expect(updated.legalName).toBe(legalName);

				// ASSERT — API boundary: the print payload carries the new identity.
				const view = await rpc(page.request, "invoices/getPrintView", {
					organizationId,
					id: inv.id,
				});
				expect(view.identity.legalName).toBe(legalName);
				expect(view.identity.registrationNo).toBe(regNo);

				// ASSERT — UI boundary: the rendered document shows it.
				await page.goto(`/print/invoice/${inv.id}`);
				await waitForWithReload(page, page.getByText(inv.invoiceNumber));
				await expect(page.getByText(legalName).first()).toBeVisible();
				await expect(page.getByText(`Reg. No. ${regNo}`)).toBeVisible();
			},
		);

		// RESTORED — the test identity must not linger on real documents.
		const after = await rpc(page.request, "billingProfile/get", {
			organizationId,
		});
		expect(after?.legalName ?? null).not.toBe(legalName);
	});
});
