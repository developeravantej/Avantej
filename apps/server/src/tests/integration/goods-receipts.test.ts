import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import {
	createPurchaseOrder,
	getPurchaseOrderById,
	approvePurchaseOrder,
	createReceipt,
	cancelReceipt,
	createSupplierInvoice,
	markInvoiceMatched,
	computeReceiptTotalCents,
} from "@avantej-core/services";
import { goodsReceipts } from "@avantej-core/db/schema/tenant/goods-receipts";
import { goodsReceiptItems } from "@avantej-core/db/schema/tenant/goods-receipt-items";
import { supplierInvoices } from "@avantej-core/db/schema/tenant/supplier-invoices";
import {
	purchaseOrderItems,
	purchaseOrders,
} from "@avantej-core/db/schema/tenant/purchase-orders";
import { productStock } from "@avantej-core/db/schema/tenant/product-stock";
import {
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";

const createdPoIds: string[] = [];
const createdReceiptIds: string[] = [];
const createdInvoiceIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	if (createdInvoiceIds.length > 0) {
		await tenantDb
			.delete(supplierInvoices)
			.where(inArray(supplierInvoices.id, createdInvoiceIds));
	}
	if (createdReceiptIds.length > 0) {
		await tenantDb
			.delete(goodsReceiptItems)
			.where(inArray(goodsReceiptItems.goodsReceiptId, createdReceiptIds));
		await tenantDb
			.delete(goodsReceipts)
			.where(inArray(goodsReceipts.id, createdReceiptIds));
	}
	if (createdPoIds.length > 0) {
		await tenantDb
			.delete(purchaseOrderItems)
			.where(inArray(purchaseOrderItems.purchaseOrderId, createdPoIds));
		await tenantDb
			.delete(purchaseOrders)
			.where(inArray(purchaseOrders.id, createdPoIds));
	}
});

async function readStock(productId: string, branchId: string) {
	const row = await tenantDb
		.select()
		.from(productStock)
		.where(
			and(
				eq(productStock.productId, productId),
				eq(productStock.branchId, branchId),
			),
		)
		.then((r) => r[0]);
	return row?.quantity ?? 0;
}

describe("Goods Receipt Integration (Agent 2.11)", () => {
	test("createReceipt -> stock increments + PO rolls to received", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-gr-1",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-gr-1", orderedQty: 5, unitCost: 1000 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_MEMBER_ID);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0];

		const before = await readStock(item.productId, TEST_BRANCH_NODE_ID);

		const receipt = await createReceipt(tenantDb, {
			purchaseOrderId: po.id,
			branchId: TEST_BRANCH_NODE_ID,
			receivedAt: new Date(),
			receivedBy: TEST_MEMBER_ID,
			items: [
				{
					purchaseOrderItemId: item.id,
					productId: item.productId,
					quantityReceived: 5,
				},
			],
		});
		createdReceiptIds.push(receipt.id);
		expect(receipt.status).toBe("posted");

		const after = await readStock(item.productId, TEST_BRANCH_NODE_ID);
		expect(after - before).toBe(5);

		const refreshed = await getPurchaseOrderById(tenantDb, po.id);
		expect(refreshed!.order.status).toBe("received");
		expect(refreshed!.items[0].receivedQty).toBe(5);
	}, 60_000);

	test("cancelReceipt -> stock reverts + PO downgrades", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-gr-cancel",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-gr-cancel", orderedQty: 3, unitCost: 500 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_MEMBER_ID);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0];

		const before = await readStock(item.productId, TEST_BRANCH_NODE_ID);

		const receipt = await createReceipt(tenantDb, {
			purchaseOrderId: po.id,
			branchId: TEST_BRANCH_NODE_ID,
			receivedAt: new Date(),
			receivedBy: TEST_MEMBER_ID,
			items: [
				{
					purchaseOrderItemId: item.id,
					productId: item.productId,
					quantityReceived: 3,
				},
			],
		});
		createdReceiptIds.push(receipt.id);

		const cancelled = await cancelReceipt(tenantDb, receipt.id);
		expect(cancelled!.status).toBe("cancelled");

		const after = await readStock(item.productId, TEST_BRANCH_NODE_ID);
		expect(after).toBe(before);

		const refreshed = await getPurchaseOrderById(tenantDb, po.id);
		expect(refreshed!.items[0].receivedQty).toBe(0);
	}, 60_000);

	test("3-way match: PO ≈ receipt ≈ invoice within tolerance", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-3way",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-3way", orderedQty: 4, unitCost: 250 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_MEMBER_ID);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0];

		const receipt = await createReceipt(tenantDb, {
			purchaseOrderId: po.id,
			branchId: TEST_BRANCH_NODE_ID,
			receivedAt: new Date(),
			receivedBy: TEST_MEMBER_ID,
			items: [
				{
					purchaseOrderItemId: item.id,
					productId: item.productId,
					quantityReceived: 4,
				},
			],
		});
		createdReceiptIds.push(receipt.id);

		const receiptTotal = await computeReceiptTotalCents(tenantDb, receipt.id);
		expect(receiptTotal).toBe(1000); // 4 * 250

		const invoice = await createSupplierInvoice(tenantDb, {
			invoiceNumber: `INV-3WAY-${Date.now()}`,
			supplierId: "11111111-2222-3333-4444-555555555555",
			purchaseOrderId: po.id,
			goodsReceiptId: receipt.id,
			totalCents: 1000,
			invoiceDate: new Date(),
		});
		createdInvoiceIds.push(invoice!.id);

		const matched = await markInvoiceMatched(tenantDb, {
			invoiceId: invoice!.id,
			matchedBy: TEST_MEMBER_ID,
		});
		expect(matched!.status).toBe("matched");
	}, 60_000);

	test("3-way match fails when invoice total drifts beyond tolerance", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-3way-bad",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-3way-bad", orderedQty: 2, unitCost: 1000 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_MEMBER_ID);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0];

		const receipt = await createReceipt(tenantDb, {
			purchaseOrderId: po.id,
			branchId: TEST_BRANCH_NODE_ID,
			receivedAt: new Date(),
			receivedBy: TEST_MEMBER_ID,
			items: [
				{
					purchaseOrderItemId: item.id,
					productId: item.productId,
					quantityReceived: 2,
				},
			],
		});
		createdReceiptIds.push(receipt.id);

		// Drift invoice by 500¢ (25% of 2000) — well outside default tolerance.
		const invoice = await createSupplierInvoice(tenantDb, {
			invoiceNumber: `INV-DRIFT-${Date.now()}`,
			supplierId: "11111111-2222-3333-4444-555555555555",
			purchaseOrderId: po.id,
			goodsReceiptId: receipt.id,
			totalCents: 2500,
			invoiceDate: new Date(),
		});
		createdInvoiceIds.push(invoice!.id);

		await expect(
			markInvoiceMatched(tenantDb, {
				invoiceId: invoice!.id,
				matchedBy: TEST_MEMBER_ID,
			}),
		).rejects.toThrow("3-way match failed");
	}, 60_000);
});
