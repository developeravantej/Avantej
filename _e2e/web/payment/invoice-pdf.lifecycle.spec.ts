import { test, expect } from "@playwright/test";
import { rpc, getOrgId } from "../_safe-mutation";

/**
 * UAT §3 — Invoice PDF download (data path).
 *
 * The PDF itself is built client-side (jsPDF, see web/components/pages/payment/
 * export-invoice-pdf.ts), so the server contract under test is `invoices.getDetail`:
 * it must return the invoice plus its line items (resolved from the linked
 * payment's payment_items) that the PDF renders. Read-only — no fixtures created,
 * nothing to tear down.
 */
test.describe("§3 invoice PDF — getDetail returns invoice + line items", () => {
	test("getDetail returns the invoice and its line-item breakdown", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const list = await rpc(page.request, "invoices/list", { organizationId });
		const invoices = Array.isArray(list) ? list : (list?.invoices ?? []);
		test.skip(
			invoices.length === 0,
			"no invoices in the test tenant to detail",
		);

		const invoiceId = invoices[0].id as string;
		const detail = await rpc(page.request, "invoices/getDetail", {
			organizationId,
			id: invoiceId,
		});

		// Shape the PDF builder depends on: invoice + items[].
		expect(detail.invoice, "getDetail returns an invoice").toBeTruthy();
		expect(detail.invoice.id).toBe(invoiceId);
		expect(detail.invoice).toHaveProperty("invoiceNumber");
		expect(detail.invoice).toHaveProperty("totalAmount");
		expect(Array.isArray(detail.items), "items is an array").toBeTruthy();

		// Every line item carries the fields the receipt renders.
		for (const item of detail.items) {
			expect(item).toHaveProperty("description");
			expect(item).toHaveProperty("quantity");
			expect(item).toHaveProperty("unitPrice");
			expect(item).toHaveProperty("totalPrice");
		}
	});

	test("getDetail on a missing invoice is rejected (not a 200 with junk)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const res = await page.request.post("/rpc/invoices/getDetail", {
			data: {
				json: {
					organizationId,
					id: "00000000-0000-4000-8000-000000000000",
				},
			},
		});
		expect(res.status(), "missing invoice -> non-2xx").toBeGreaterThanOrEqual(
			400,
		);
	});
});
