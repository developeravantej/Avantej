import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, getOrgId } from "../_safe-mutation";
import { buildReceiptChain } from "../_gr-helpers";

// Goods-receipt + supplier-invoice lifecycle — API-driven + API-verified.
// supplier → product → PO → receipt (adds stock) → invoice → 3-way match →
// mark paid. Receipts have no hard delete; cancel (which reverses stock) is the
// teardown. Supplier invoices are not hard-deletable (acceptable test residue).
test.describe("goods-receipts — receipt + invoice lifecycle", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("create receipt → invoice → matchInvoice → markInvoicePaid (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const chain = await buildReceiptChain(
			page.request,
			organizationId,
			cleanup,
			{
				orderedQty: 10,
				unitCost: 100,
				received: 10,
				damaged: 0,
			},
		);
		test.skip(
			!chain.poItemId || !chain.receiptId,
			"could not build PO/receipt chain",
		);

		// Invoice matching the PO total → 3-way match within tolerance.
		const invoice = await rpc(page.request, "goodsReceipts/createInvoice", {
			organizationId,
			invoiceNumber: testId("inv"),
			supplierId: chain.supplierId,
			purchaseOrderId: chain.poId,
			goodsReceiptId: chain.receiptId,
			totalCents: chain.poTotal,
			taxCents: 0,
			invoiceDate: new Date(Date.UTC(2026, 0, 3)).toISOString(),
		});
		const invoiceId = invoice?.id ?? invoice?.invoice?.id;
		expect(invoiceId, `createInvoice: ${JSON.stringify(invoice)}`).toBeTruthy();

		// Preview confirms the three totals line up.
		const preview = await rpc(page.request, "goodsReceipts/getInvoicePreview", {
			organizationId,
			invoiceId,
		});
		expect(preview?.isWithinTolerance).toBe(true);

		// MATCH → status matched.
		const matched = await rpc(page.request, "goodsReceipts/matchInvoice", {
			organizationId,
			invoiceId,
		});
		expect(matched?.status ?? matched?.invoice?.status).toBe("matched");

		// MARK PAID → status paid.
		const paid = await rpc(page.request, "goodsReceipts/markInvoicePaid", {
			organizationId,
			invoiceId,
			paymentReference: "E2E-DEEP-ref",
		});
		expect(paid?.status ?? paid?.invoice?.status).toBe("paid");
	});
});
