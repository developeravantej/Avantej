import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
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
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { suppliers } from "@avantej-core/db/schema/tenant/suppliers";
import { products } from "@avantej-core/db/schema/tenant/products";
import { unitsOfMeasure } from "@avantej-core/db/schema/tenant/units-of-measure";

const createdPoIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;
let testBranchNodeId: string;
let testSupplierId: string;
let testUomId: string;
const testProductIds: string[] = [];

async function createTestProduct(suffix: string): Promise<string> {
	const [p] = await tenantDb
		.insert(products)
		.values({
			sku: `INT-PO-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			name: `Test Product ${suffix}`,
			uomId: testUomId,
			price: 100,
		} as any)
		.returning();
	if (!p) throw new Error("Failed to create test product");
	testProductIds.push(p.id);
	return p.id;
}

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	const [node] = await tenantDb
		.insert(hierarchyNodes)
		.values({
			name: `Test Branch for PO ${Date.now()}`,
			type: "branch",
			depth: 4,
		} as any)
		.returning();
	if (!node) throw new Error("Failed to create test hierarchy node");
	testBranchNodeId = node.id;

	const [supplier] = await tenantDb
		.insert(suppliers)
		.values({
			name: `Test Supplier PO ${Date.now()}`,
		} as any)
		.returning();
	if (!supplier) throw new Error("Failed to create test supplier");
	testSupplierId = supplier.id;

	const [uom] = await tenantDb
		.insert(unitsOfMeasure)
		.values({
			name: `unit-po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		} as any)
		.returning();
	if (!uom) throw new Error("Failed to create test UoM");
	testUomId = uom.id;
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	if (createdPoIds.length > 0) {
		await tenantDb
			.delete(purchaseOrderItems)
			.where(inArray(purchaseOrderItems.purchaseOrderId, createdPoIds));
		await tenantDb
			.delete(purchaseOrders)
			.where(inArray(purchaseOrders.id, createdPoIds));
	}
	if (testProductIds.length > 0) {
		try {
			await tenantDb
				.delete(products)
				.where(inArray(products.id, testProductIds));
		} catch {}
	}
	if (testSupplierId) {
		try {
			await tenantDb.delete(suppliers).where(eq(suppliers.id, testSupplierId));
		} catch {}
	}
	if (testUomId) {
		try {
			await tenantDb
				.delete(unitsOfMeasure)
				.where(eq(unitsOfMeasure.id, testUomId));
		} catch {}
	}
	if (testBranchNodeId) {
		try {
			await tenantDb
				.delete(hierarchyNodes)
				.where(eq(hierarchyNodes.id, testBranchNodeId));
		} catch {}
	}
});

describe("Purchase Orders Integration", () => {
	test("create PO -> approve -> receive partial -> receive remaining (full lifecycle)", async () => {
		if (shouldSkipIntegration()) return;

		const productId1 = await createTestProduct("int-1");
		const productId2 = await createTestProduct("int-2");

		// Step 1: Create PO with 2 line items
		const created = await createPurchaseOrder(tenantDb, {
			supplierId: testSupplierId,
			branchId: testBranchNodeId,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [
				{ productId: productId1, orderedQty: 10, unitCost: 1000 },
				{ productId: productId2, orderedQty: 5, unitCost: 2000 },
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

		const item1 = detail!.items.find((i) => i.productId === productId1)!;
		const item2 = detail!.items.find((i) => i.productId === productId2)!;

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

		const productId = await createTestProduct("ponum");
		const po = await createPurchaseOrder(tenantDb, {
			supplierId: testSupplierId,
			branchId: testBranchNodeId,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId, orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po.id);

		expect(po.purchaseOrderNumber).toMatch(/^PO-\d{8}-\d{4}$/);
	}, 30000);

	test("PO number increments across multiple POs created same day", async () => {
		if (shouldSkipIntegration()) return;

		const productSeq1 = await createTestProduct("seq-1");
		const productSeq2 = await createTestProduct("seq-2");
		const po1 = await createPurchaseOrder(tenantDb, {
			supplierId: testSupplierId,
			branchId: testBranchNodeId,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: productSeq1, orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po1.id);

		const po2 = await createPurchaseOrder(tenantDb, {
			supplierId: testSupplierId,
			branchId: testBranchNodeId,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId: productSeq2, orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po2.id);

		// Extract sequence numbers from PO-YYYYMMDD-NNNN
		const seq1 = parseInt(po1.purchaseOrderNumber.split("-").pop()!);
		const seq2 = parseInt(po2.purchaseOrderNumber.split("-").pop()!);
		expect(seq2).toBeGreaterThan(seq1);
	}, 30000);

	test("only draft POs can be approved", async () => {
		if (shouldSkipIntegration()) return;

		const productId = await createTestProduct("guard");
		const po = await createPurchaseOrder(tenantDb, {
			supplierId: testSupplierId,
			branchId: testBranchNodeId,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId, orderedQty: 1, unitCost: 100 }],
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
		const productId = await createTestProduct("cancel");
		const po = await createPurchaseOrder(tenantDb, {
			supplierId: testSupplierId,
			branchId: testBranchNodeId,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId, orderedQty: 1, unitCost: 100 }],
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

		const productId = await createTestProduct("cancel-ok");
		const po = await createPurchaseOrder(tenantDb, {
			supplierId: testSupplierId,
			branchId: testBranchNodeId,
			orderDate: new Date(),
			createdBy: TEST_MEMBER_ID,
			items: [{ productId, orderedQty: 1, unitCost: 100 }],
		});
		createdPoIds.push(po.id);

		const cancelled = await cancelPurchaseOrder(tenantDb, po.id);
		expect(cancelled!.status).toBe("cancelled");
	}, 30000);
});
