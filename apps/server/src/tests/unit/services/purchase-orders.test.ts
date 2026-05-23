import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makePurchaseOrder, makePurchaseOrderItem } from "../../helpers/fixtures";

import {
	listPurchaseOrders,
	getPurchaseOrderById,
	createPurchaseOrder,
	approvePurchaseOrder,
	receiveItems,
	cancelPurchaseOrder,
} from "@avantej-core/services/purchase-orders.service";

let mockDb: any;
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
// Phase 8.4 — actor for approve/cancel audit row.
const ACTOR = {
	userId: "test-user-id",
	memberId: MEMBER_ID,
	role: "admin" as const,
	branchId: BRANCH_NODE_ID,
};

function selectChainResolving(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of ["from", "where", "orderBy", "limit", "offset", "leftJoin", "innerJoin", "groupBy", "having"]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listPurchaseOrders ──────────────────────────────────────────────────────
describe("listPurchaseOrders", () => {
	test("returns purchase orders from select chain", async () => {
		const orders = [makePurchaseOrder(), makePurchaseOrder()];
		mockDb.select.mockReturnValueOnce(selectChainResolving(orders));

		const result = await listPurchaseOrders(mockDb, {});

		expect(result as any).toEqual(orders);
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no orders exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await listPurchaseOrders(mockDb, {});

		expect(result).toEqual([]);
	});
});

// ─── getPurchaseOrderById ────────────────────────────────────────────────────
describe("getPurchaseOrderById", () => {
	test("returns order with items when found", async () => {
		const order = makePurchaseOrder();
		const items = [
			makePurchaseOrderItem({ purchaseOrderId: order.id }),
			makePurchaseOrderItem({ purchaseOrderId: order.id }),
		];

		// First select: order
		mockDb.select.mockReturnValueOnce(selectChainResolving([order]));
		// Second select: items
		mockDb.select.mockReturnValueOnce(selectChainResolving(items));

		const result = await getPurchaseOrderById(mockDb, order.id);

		expect(result).toBeDefined();
		expect(result!.order as any).toEqual(order);
		expect(result!.items as any).toEqual(items);
	});

	test("returns undefined when order not found", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getPurchaseOrderById(mockDb, "nonexistent");

		expect(result).toBeUndefined();
	});
});

// ─── createPurchaseOrder — PO number generation ─────────────────────────────
describe("createPurchaseOrder — PO number generation", () => {
	test("generates format PO-YYYYMMDD-NNNN via transaction", async () => {
		const createdPO = makePurchaseOrder({ status: "draft" });

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			// generatePONumber: select({total: count()}).from().where()
			tx.select.mockReturnValueOnce(selectChainResolving([{ total: 0 }]));
			// Insert PO
			const insertValues = { returning: mock(() => Promise.resolve([createdPO])) };
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });
			// Insert items
			tx.insert.mockReturnValueOnce({ values: mock(() => ({ returning: mock(() => Promise.resolve([])) })) });
			return cb(tx);
		});

		const result = await createPurchaseOrder(mockDb, {
			supplierId: "supplier-1",
			branchId: BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: MEMBER_ID,
			items: [{ productId: "prod-1", orderedQty: 10, unitCost: 5000 }],
		});

		expect((result as any).purchaseOrderNumber).toMatch(/^PO-\d{8}-\d{4}$/);
		expect(result.status).toBe("draft");
	});

	test("increments sequence number for subsequent POs on the same day", async () => {
		const createdPO = makePurchaseOrder({ purchaseOrderNumber: "PO-20260227-0006" });

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			// 5 existing POs today
			tx.select.mockReturnValueOnce(selectChainResolving([{ total: 5 }]));
			const insertValues = { returning: mock(() => Promise.resolve([createdPO])) };
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });
			tx.insert.mockReturnValueOnce({ values: mock(() => ({ returning: mock(() => Promise.resolve([])) })) });
			return cb(tx);
		});

		const result = await createPurchaseOrder(mockDb, {
			supplierId: "s1",
			branchId: BRANCH_NODE_ID,
			orderDate: new Date(),
			createdBy: MEMBER_ID,
			items: [{ productId: "p1", orderedQty: 1, unitCost: 100 }],
		});

		expect((result as any).purchaseOrderNumber).toContain("0006");
	});
});

// ─── approvePurchaseOrder — status machine ──────────────────────────────────
describe("approvePurchaseOrder", () => {
	test("approves a draft PO", async () => {
		const po = makePurchaseOrder({ status: "draft" });
		const approved = { ...po, status: "approved", approvedBy: MEMBER_ID };

		mockDb.select.mockReturnValueOnce(selectChainResolving([po]));

		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([approved])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await approvePurchaseOrder(mockDb, po.id, ACTOR);

		expect(result!.status).toBe("approved");
	});

	test("throws when trying to approve non-draft PO", async () => {
		const po = makePurchaseOrder({ status: "approved" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([po]));

		await expect(
			approvePurchaseOrder(mockDb, po.id, ACTOR),
		).rejects.toThrow("Only draft purchase orders can be approved");
	});

	test("throws when PO not found", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await expect(
			approvePurchaseOrder(mockDb, "nonexistent", ACTOR),
		).rejects.toThrow("Purchase order not found");
	});
});

// ─── receiveItems ────────────────────────────────────────────────────────────
describe("receiveItems", () => {
	test("sets status to partially_received when not all items received", async () => {
		const po = makePurchaseOrder({ status: "approved" });
		const item = makePurchaseOrderItem({
			purchaseOrderId: po.id,
			orderedQty: 10,
			receivedQty: 5,
		});
		const updatedPO = { ...po, status: "partially_received" };

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			// update item receivedQty
			const itemSetChain = { where: mock(() => Promise.resolve()) };
			tx.update.mockReturnValueOnce({ set: mock(() => itemSetChain) });
			// select all items after update
			tx.select.mockReturnValueOnce(selectChainResolving([item]));
			// update PO status
			const poSetChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([updatedPO])) })) };
			tx.update.mockReturnValueOnce({ set: mock(() => poSetChain) });
			return cb(tx);
		});

		const result = await receiveItems(mockDb, po.id, [{ itemId: item.id, receivedQty: 5 }]);

		expect(result!.status).toBe("partially_received");
	});

	test("sets status to received when all items fully received", async () => {
		const po = makePurchaseOrder({ status: "approved" });
		const item = makePurchaseOrderItem({
			purchaseOrderId: po.id,
			orderedQty: 5,
			receivedQty: 5,
		});
		const updatedPO = { ...po, status: "received" };

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const itemSetChain = { where: mock(() => Promise.resolve()) };
			tx.update.mockReturnValueOnce({ set: mock(() => itemSetChain) });
			tx.select.mockReturnValueOnce(selectChainResolving([item]));
			const poSetChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([updatedPO])) })) };
			tx.update.mockReturnValueOnce({ set: mock(() => poSetChain) });
			return cb(tx);
		});

		const result = await receiveItems(mockDb, po.id, [{ itemId: item.id, receivedQty: 5 }]);

		expect(result!.status).toBe("received");
	});

	test("handles incremental receiving (partially received then received)", async () => {
		const po = makePurchaseOrder({ status: "partially_received" });
		const item = makePurchaseOrderItem({
			purchaseOrderId: po.id,
			orderedQty: 5,
			receivedQty: 5,
		});
		const updatedPO = { ...po, status: "received" };

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const itemSetChain = { where: mock(() => Promise.resolve()) };
			tx.update.mockReturnValueOnce({ set: mock(() => itemSetChain) });
			tx.select.mockReturnValueOnce(selectChainResolving([item]));
			const poSetChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([updatedPO])) })) };
			tx.update.mockReturnValueOnce({ set: mock(() => poSetChain) });
			return cb(tx);
		});

		const result = await receiveItems(mockDb, po.id, [{ itemId: item.id, receivedQty: 2 }]);

		expect(result!.status).toBe("received");
	});
});

// ─── cancelPurchaseOrder ─────────────────────────────────────────────────────
describe("cancelPurchaseOrder", () => {
	test("cancels a draft PO", async () => {
		const po = makePurchaseOrder({ status: "draft" });
		const cancelled = { ...po, status: "cancelled" };

		mockDb.select.mockReturnValueOnce(selectChainResolving([po]));
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([cancelled])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await cancelPurchaseOrder(mockDb, po.id, ACTOR);

		expect(result!.status).toBe("cancelled");
	});

	test("cancels an approved PO", async () => {
		const po = makePurchaseOrder({ status: "approved" });
		const cancelled = { ...po, status: "cancelled" };

		mockDb.select.mockReturnValueOnce(selectChainResolving([po]));
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([cancelled])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await cancelPurchaseOrder(mockDb, po.id, ACTOR);

		expect(result!.status).toBe("cancelled");
	});

	test("throws when cancelling a received PO", async () => {
		const po = makePurchaseOrder({ status: "received" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([po]));

		await expect(cancelPurchaseOrder(mockDb, po.id, ACTOR)).rejects.toThrow(
			"Only draft or approved purchase orders can be cancelled",
		);
	});

	test("throws when PO not found", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await expect(cancelPurchaseOrder(mockDb, "nonexistent", ACTOR)).rejects.toThrow("Purchase order not found");
	});
});
