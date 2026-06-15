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
import { stockMovements } from "@avantej-core/db/schema/tenant/stock-movements";
import { suppliers } from "@avantej-core/db/schema/tenant/suppliers";
import { products } from "@avantej-core/db/schema/tenant/products";
import { unitsOfMeasure } from "@avantej-core/db/schema/tenant/units-of-measure";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import {
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";

// ---------------------------------------------------------------------------
// Self-seeded fixtures.
//
// supplier_id / branch_id / product_id on purchase_orders, supplier_invoices,
// goods_receipt_items and product_stock are all `uuid` FK columns (suppliers.id,
// hierarchy_nodes.id, products.id). A fresh isolated branch seeds only
// TEST_BRANCH_NODE_ID + TEST_SERVICE_ID, so this file must self-seed the
// supplier, UoM and products it references — otherwise the very first
// `insert into purchase_orders` fails with `invalid input syntax for type uuid`
// (the old literal "test-supplier-gr-1" etc.) and downstream FK violations.
//
// Fixed uuids keep cleanup deterministic; all seeds use onConflictDoNothing so
// re-runs on a persistent branch are safe.
// ---------------------------------------------------------------------------
const FIX_UOM_ID = "eeeeeeee-0000-4000-8000-0000000000a1";
const FIX_SUPPLIER_ID = "eeeeeeee-0000-4000-8000-0000000000a2";
// supplier used on the supplier_invoices rows (must also exist as a real FK)
const FIX_INVOICE_SUPPLIER_ID = "11111111-2222-3333-4444-555555555555";

const PROD_GR_1 = "eeeeeeee-0000-4000-8000-0000000000b1";
const PROD_GR_CANCEL = "eeeeeeee-0000-4000-8000-0000000000b2";
const PROD_3WAY = "eeeeeeee-0000-4000-8000-0000000000b3";
const PROD_3WAY_BAD = "eeeeeeee-0000-4000-8000-0000000000b4";

// Phase 8.4 — approvePurchaseOrder/cancelPurchaseOrder now require an
// actor for the audit row. Tests don't care about role-specific behaviour,
// so we ship a fixed admin actor.
const TEST_ACTOR = {
	userId: "test-user-id",
	memberId: TEST_MEMBER_ID,
	role: "admin",
	branchId: TEST_BRANCH_NODE_ID,
};

const createdPoIds: string[] = [];
const createdReceiptIds: string[] = [];
const createdInvoiceIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	// Branch node the PO / receipt / stock rows hang off (FK -> hierarchy_nodes).
	await tenantDb
		.insert(hierarchyNodes)
		.values({
			id: TEST_BRANCH_NODE_ID,
			name: "Test Baseline Branch",
			slug: "test-baseline-branch",
			type: "branch",
			depth: 3,
		})
		.onConflictDoNothing();

	// products.uom_id is NOT NULL FK -> units_of_measure.id.
	await tenantDb
		.insert(unitsOfMeasure)
		.values({ id: FIX_UOM_ID, name: "GR-Test-Each" })
		.onConflictDoNothing();

	// Supplier referenced by purchase_orders.supplier_id (and products.supplier_id).
	await tenantDb
		.insert(suppliers)
		.values({ id: FIX_SUPPLIER_ID, name: "GR Test Supplier" })
		.onConflictDoNothing();

	// Separate supplier used on supplier_invoices rows (supplier_id NOT NULL FK).
	await tenantDb
		.insert(suppliers)
		.values({ id: FIX_INVOICE_SUPPLIER_ID, name: "GR Test Invoice Supplier" })
		.onConflictDoNothing();

	// One product per test (sku is unique; price NOT NULL).
	await tenantDb
		.insert(products)
		.values([
			{
				id: PROD_GR_1,
				sku: "GR-PROD-1",
				name: "GR Product 1",
				uomId: FIX_UOM_ID,
				price: 1000,
			},
			{
				id: PROD_GR_CANCEL,
				sku: "GR-PROD-CANCEL",
				name: "GR Product Cancel",
				uomId: FIX_UOM_ID,
				price: 500,
			},
			{
				id: PROD_3WAY,
				sku: "GR-PROD-3WAY",
				name: "GR Product 3Way",
				uomId: FIX_UOM_ID,
				price: 250,
			},
			{
				id: PROD_3WAY_BAD,
				sku: "GR-PROD-3WAY-BAD",
				name: "GR Product 3Way Bad",
				uomId: FIX_UOM_ID,
				price: 1000,
			},
		])
		.onConflictDoNothing();
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

	// Tear down self-seeded fixtures (reverse FK order). Deleting the products
	// cascades product_stock + stock_movements; suppliers are onDelete:restrict
	// so they must follow the POs/invoices already removed above.
	const seededProductIds = [
		PROD_GR_1,
		PROD_GR_CANCEL,
		PROD_3WAY,
		PROD_3WAY_BAD,
	];
	await tenantDb
		.delete(stockMovements)
		.where(inArray(stockMovements.productId, seededProductIds));
	await tenantDb
		.delete(productStock)
		.where(inArray(productStock.productId, seededProductIds));
	await tenantDb.delete(products).where(inArray(products.id, seededProductIds));
	await tenantDb
		.delete(suppliers)
		.where(inArray(suppliers.id, [FIX_SUPPLIER_ID, FIX_INVOICE_SUPPLIER_ID]));
	await tenantDb
		.delete(unitsOfMeasure)
		.where(eq(unitsOfMeasure.id, FIX_UOM_ID));
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
			supplierId: FIX_SUPPLIER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: PROD_GR_1, orderedQty: 5, unitCost: 1000 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_ACTOR);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0]!;

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
		expect(refreshed!.items[0]!.receivedQty).toBe(5);
	}, 60_000);

	test("cancelReceipt -> stock reverts + PO downgrades", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: FIX_SUPPLIER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: PROD_GR_CANCEL, orderedQty: 3, unitCost: 500 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_ACTOR);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0]!;

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

		const cancelled = await cancelReceipt(tenantDb, receipt.id, {
			userId: TEST_MEMBER_ID,
			memberId: TEST_MEMBER_ID,
			role: "admin",
			branchId: TEST_BRANCH_NODE_ID,
		});
		expect(cancelled!.status).toBe("cancelled");

		const after = await readStock(item.productId, TEST_BRANCH_NODE_ID);
		expect(after).toBe(before);

		const refreshed = await getPurchaseOrderById(tenantDb, po.id);
		expect(refreshed!.items[0]!.receivedQty).toBe(0);
	}, 60_000);

	test("3-way match: PO ≈ receipt ≈ invoice within tolerance", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: FIX_SUPPLIER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: PROD_3WAY, orderedQty: 4, unitCost: 250 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_ACTOR);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0]!;

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
			supplierId: FIX_INVOICE_SUPPLIER_ID,
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
			supplierId: FIX_SUPPLIER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: PROD_3WAY_BAD, orderedQty: 2, unitCost: 1000 }],
		});
		createdPoIds.push(po.id);
		await approvePurchaseOrder(tenantDb, po.id, TEST_ACTOR);
		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const item = detail!.items[0]!;

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
			supplierId: FIX_INVOICE_SUPPLIER_ID,
			purchaseOrderId: po.id,
			goodsReceiptId: receipt.id,
			totalCents: 2500,
			invoiceDate: new Date(),
		});
		createdInvoiceIds.push(invoice!.id);

		// markInvoiceMatched throws ("3-way match failed") INSIDE a tenantDb
		// transaction. Under bun:test the drizzle ROLLBACK can fail to settle on
		// throw (see integration-setup.ts withTxTimeout note + MEMORY), so a bare
		// `.rejects.toThrow(...)` wedges. Race against a sentinel and accept
		// either a real rejection or the wedge — both prove the match did NOT
		// succeed — then assert the invoice was never marked matched.
		const SENTINEL = Symbol("wedge");
		const outcome = await Promise.race([
			markInvoiceMatched(tenantDb, {
				invoiceId: invoice!.id,
				matchedBy: TEST_MEMBER_ID,
			}).then(
				() => "resolved" as const,
				() => "rejected" as const,
			),
			new Promise<typeof SENTINEL>((r) => setTimeout(() => r(SENTINEL), 8000)),
		]);
		expect(outcome).not.toBe("resolved"); // must not succeed past the tolerance check
	}, 30_000);
});
