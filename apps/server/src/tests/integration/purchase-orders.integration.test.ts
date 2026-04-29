import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import {
	createPurchaseOrder,
	getPurchaseOrderById,
	approvePurchaseOrder,
	receiveItems,
	cancelPurchaseOrder,
} from "@avantej-core/services";
import {
	purchaseOrders,
	purchaseOrderItems,
} from "@avantej-core/db/schema/tenant/purchase-orders";

const createdPoIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || createdPoIds.length === 0) return;
	// Clean up items first (FK constraint), then orders
	await tenantDb
		.delete(purchaseOrderItems)
		.where(inArray(purchaseOrderItems.purchaseOrderId, createdPoIds));
	await tenantDb
		.delete(purchaseOrders)
		.where(inArray(purchaseOrders.id, createdPoIds));
});

describe("Purchase Orders Integration", () => {
	test("create PO -> approve -> receive partial -> receive remaining (full lifecycle)", async () => {
		if (shouldSkipIntegration()) return;

		// Step 1: Create PO with 2 line items
		const created = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-integration",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [
				{ productId: "prod-int-1", orderedQty: 10, unitCost: 1000 },
				{ productId: "prod-int-2", orderedQty: 5, unitCost: 2000 },
			],
		});
		createdPoIds.push(created.id);

		expect(created.status).toBe("draft");
		expect(created.purchaseOrderNumber).toMatch(/^PO-\d{8}-\d{4}$/);
		expect(created.totalAmount).toBe(20000); // 10*1000 + 5*2000

		// Step 2: Approve
		const approved = await approvePurchaseOrder(
			tenantDb,
			created.id,
			TEST_MEMBER_ID,
		);
		expect(approved!.status).toBe("approved");
		expect(approved!.approvedBy).toBe(TEST_MEMBER_ID);

		// Step 3: Get detail to get item IDs
		const detail = await getPurchaseOrderById(tenantDb, created.id);
		expect(detail).toBeTruthy();
		expect(detail!.items.length).toBe(2);

		const item1 = detail!.items.find((i) => i.productId === "prod-int-1")!;
		const item2 = detail!.items.find((i) => i.productId === "prod-int-2")!;

		// Receive item1 partially (5 of 10)
		const partial = await receiveItems(tenantDb, created.id, [
			{ itemId: item1.id, receivedQty: 5 },
		]);
		expect(partial!.status).toBe("partially_received");

		// Step 4: Receive remaining
		const complete = await receiveItems(tenantDb, created.id, [
			{ itemId: item1.id, receivedQty: 5 }, // remaining 5 of item1
			{ itemId: item2.id, receivedQty: 5 }, // all of item2
		]);
		expect(complete!.status).toBe("received");
	}, 60000);

	test("PO number format matches PO-YYYYMMDD-NNNN", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-ponum",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-ponum", orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po.id);

		expect(po.purchaseOrderNumber).toMatch(/^PO-\d{8}-\d{4}$/);
	}, 30000);

	test("PO number increments across multiple POs created same day", async () => {
		if (shouldSkipIntegration()) return;

		const po1 = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-seq-1",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-seq-1", orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po1.id);

		const po2 = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-seq-2",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-seq-2", orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po2.id);

		// Extract sequence numbers from PO-YYYYMMDD-NNNN
		const seq1 = parseInt(po1.purchaseOrderNumber.split("-").pop()!);
		const seq2 = parseInt(po2.purchaseOrderNumber.split("-").pop()!);
		expect(seq2).toBeGreaterThan(seq1);
	}, 30000);

	test("only draft POs can be approved", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-approve-guard",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-guard", orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po.id);

		// Approve once (should succeed)
		await approvePurchaseOrder(tenantDb, po.id, TEST_MEMBER_ID);

		// Approve again (should fail - not draft anymore)
		await expect(
			approvePurchaseOrder(tenantDb, po.id, TEST_MEMBER_ID),
		).rejects.toThrow("Only draft purchase orders can be approved");
	}, 30000);

	test("cannot cancel a received PO", async () => {
		if (shouldSkipIntegration()) return;

		// Create -> approve -> fully receive
		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-cancel-guard",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-cancel", orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po.id);

		await approvePurchaseOrder(tenantDb, po.id, TEST_MEMBER_ID);

		const detail = await getPurchaseOrderById(tenantDb, po.id);
		const itemId = detail!.items[0]!.id;

		await receiveItems(tenantDb, po.id, [{ itemId, receivedQty: 1 }]);

		// Attempt to cancel received PO
		await expect(cancelPurchaseOrder(tenantDb, po.id)).rejects.toThrow(
			"Only draft or approved purchase orders can be cancelled",
		);
	}, 60000);

	test("cancel draft PO succeeds", async () => {
		if (shouldSkipIntegration()) return;

		const po = await createPurchaseOrder(tenantDb, {
			supplierId: "test-supplier-cancel-ok",
			branchId: TEST_BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: "prod-cancel-ok", orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po.id);

		const cancelled = await cancelPurchaseOrder(tenantDb, po.id);
		expect(cancelled!.status).toBe("cancelled");
	}, 30000);
});
