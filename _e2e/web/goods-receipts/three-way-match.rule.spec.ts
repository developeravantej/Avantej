import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	getOrgId,
	expectRejected,
} from "../_safe-mutation";
import { buildReceiptChain, stockQty } from "../_gr-helpers";

// Goods-receipt / supplier-invoice domain invariants.
test.describe("goods-receipts — invariants", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("damaged units do not enter sellable stock (stock += received - damaged)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Build supplier+product+PO WITHOUT a receipt first so we can read the
		// pre-receipt stock for this fresh product.
		const chain = await buildReceiptChain(
			page.request,
			organizationId,
			cleanup,
			{
				orderedQty: 10,
				unitCost: 100,
				makeReceipt: false,
			},
		);
		test.skip(!chain.poItemId, "could not build PO chain");

		const before = stockQty(
			await rpc(page.request, "products/getStock", {
				organizationId,
				productId: chain.productId,
				branchId: chain.branchId,
			}),
		);

		// Receive 10, of which 2 are damaged → only 8 should become sellable.
		const receipt = await rpc(page.request, "goodsReceipts/create", {
			organizationId,
			purchaseOrderId: chain.poId,
			branchId: chain.branchId,
			receivedAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
			items: [
				{
					purchaseOrderItemId: chain.poItemId,
					productId: chain.productId,
					quantityReceived: 10,
					quantityDamaged: 2,
				},
			],
		});
		const receiptId = receipt?.id ?? receipt?.receipt?.id;
		cleanup.add(`receipt ${receiptId}`, async () => {
			await rpc(page.request, "goodsReceipts/cancel", {
				organizationId,
				id: receiptId,
			}).catch(() => {});
		});

		const after = stockQty(
			await rpc(page.request, "products/getStock", {
				organizationId,
				productId: chain.productId,
				branchId: chain.branchId,
			}),
		);
		expect(after - before).toBe(8);
	});

	test("3-way match fails when invoice total is outside tolerance", async ({
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
			},
		);
		test.skip(!chain.receiptId, "could not build receipt chain");

		// Invoice total wildly off the PO/receipt total → match must fail.
		const invoice = await rpc(page.request, "goodsReceipts/createInvoice", {
			organizationId,
			invoiceNumber: testId("inv"),
			supplierId: chain.supplierId,
			purchaseOrderId: chain.poId,
			goodsReceiptId: chain.receiptId,
			totalCents: chain.poTotal + 100_000,
			taxCents: 0,
			invoiceDate: new Date(Date.UTC(2026, 0, 3)).toISOString(),
		});
		const invoiceId = invoice?.id ?? invoice?.invoice?.id;
		expect(invoiceId).toBeTruthy();

		await expectRejected(
			page.request,
			"goodsReceipts/matchInvoice",
			{ organizationId, invoiceId },
			[400],
		);
	});

	test("a paid invoice is not editable (only pending/disputed are)", async ({
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
			},
		);
		test.skip(!chain.receiptId, "could not build receipt chain");

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
		expect(invoiceId).toBeTruthy();

		await rpc(page.request, "goodsReceipts/matchInvoice", {
			organizationId,
			invoiceId,
		});
		await rpc(page.request, "goodsReceipts/markInvoicePaid", {
			organizationId,
			invoiceId,
			paymentReference: "E2E-DEEP-ref",
		});

		// Editing a paid invoice → BAD_REQUEST.
		await expectRejected(
			page.request,
			"goodsReceipts/updateInvoice",
			{ organizationId, invoiceId, totalCents: 999 },
			[400],
		);
	});
});
