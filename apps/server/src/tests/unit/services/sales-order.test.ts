import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listSalesOrders,
	getSalesOrderById,
	createSalesOrder,
	updateSalesOrder,
	cancelSalesOrder,
} from "@avantej-core/services";

// Shared mocks
const mockFindMany = mock(() => Promise.resolve([]));
const mockFindFirst = mock(() => Promise.resolve(null));
const mockReturning = mock(() => Promise.resolve([]));
const mockValues = mock(() => ({ returning: mockReturning }));
const mockInsert = mock(() => ({ values: mockValues }));
const mockUpdate = mock(() => ({
	set: mock(() => ({
		where: mock(() => ({ returning: mockReturning })),
	})),
}));

// select chain for count queries: select({total}).from(table).where(...) → [{total: N}]
const mockSelectWhere = mock(() => Promise.resolve([{ total: 0 }]));
const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
const mockSelect = mock(() => ({ from: mockSelectFrom }));

const mockTransaction = mock(async (fn: any) => fn(mockTx));
const mockTx = {
	update: mock(() => ({
		set: mock(() => ({
			where: mock(() => ({ returning: mockReturning })),
		})),
	})),
	insert: mock(() => ({ values: mockValues })),
};

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	select: mockSelect,
	query: {
		salesOrders: {
			findMany: mockFindMany,
			findFirst: mockFindFirst,
		},
	},
	transaction: mockTransaction,
} as any;

beforeEach(() => {
	mockFindMany.mockClear();
	mockFindFirst.mockClear();
	mockReturning.mockClear();
	mockValues.mockClear();
	mockInsert.mockClear();
	mockUpdate.mockClear();
	mockSelectWhere.mockClear();
	mockSelectFrom.mockClear();
	mockSelect.mockClear();
	mockTransaction.mockClear();
});

describe("listSalesOrders", () => {
	test("returns all orders with no filters", async () => {
		const fakeOrders = [
			{ id: "so1", salesOrderNumber: "SO-20260227-0001", branchId: "br1" },
		];
		mockFindMany.mockResolvedValueOnce(fakeOrders);

		const result = await listSalesOrders(mockTenantDb);

		expect(result).toEqual(fakeOrders);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeUndefined();
	});

	test("applies status filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listSalesOrders(mockTenantDb, { status: "confirmed" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies customerId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listSalesOrders(mockTenantDb, { customerId: "cust-1" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies date range filters", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		const from = new Date("2026-01-01");
		const to = new Date("2026-01-31");
		await listSalesOrders(mockTenantDb, { from, to });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("post-filters by accessibleNodeIds", async () => {
		const allOrders = [
			{ id: "so1", branchId: "br1" },
			{ id: "so2", branchId: "br2" },
			{ id: "so3", branchId: "br3" },
		];
		mockFindMany.mockResolvedValueOnce(allOrders);

		const result = await listSalesOrders(mockTenantDb, { accessibleNodeIds: ["br1", "br3"] });

		expect(result).toHaveLength(2);
		expect(result.map((o) => o.id)).toEqual(["so1", "so3"]);
	});
});

describe("getSalesOrderById", () => {
	test("returns order when found", async () => {
		const fakeOrder = { id: "so1", salesOrderNumber: "SO-20260227-0001" };
		mockFindFirst.mockResolvedValueOnce(fakeOrder);

		const result = await getSalesOrderById(mockTenantDb, "so1");

		expect(result).toEqual(fakeOrder);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when order not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getSalesOrderById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createSalesOrder", () => {
	test("generates order number and inserts the order (total=3 → 0004)", async () => {
		// Mock count query → total=3 → seq=4 → SO-20260227-0004
		mockSelectWhere.mockResolvedValueOnce([{ total: 3 }]);

		const fakeOrder = {
			id: "so1",
			salesOrderNumber: "SO-20260227-0004",
			customerName: "Alice",
			totalAmount: 100,
			status: "draft",
		};
		mockReturning.mockResolvedValueOnce([fakeOrder]);

		const result = await createSalesOrder(mockTenantDb, {
			date: new Date("2026-02-27"),
			customerName: "Alice",
			createdBy: "user-1",
			branchId: "br1",
			totalAmount: 100,
		});

		expect(result).toEqual(fakeOrder);
		expect(mockSelect).toHaveBeenCalledTimes(1);
		expect(mockInsert).toHaveBeenCalledTimes(1);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.salesOrderNumber).toBe("SO-20260227-0004");
		expect(valuesArg.status).toBe("draft");
	});

	test("generates order number 0001 when no existing orders (total=0)", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const fakeOrder = { id: "so1", salesOrderNumber: "SO-20260227-0001" };
		mockReturning.mockResolvedValueOnce([fakeOrder]);

		const result = await createSalesOrder(mockTenantDb, {
			date: new Date("2026-02-27"),
			customerName: "Bob",
			createdBy: "user-1",
			branchId: "br1",
			totalAmount: 50,
		});

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.salesOrderNumber).toMatch(/SO-\d{8}-0001/);
	});

	test("throws 'Failed to create sales order' when insert returns empty", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			createSalesOrder(mockTenantDb, {
				date: new Date("2026-02-27"),
				customerName: "Bob",
				createdBy: "user-1",
				branchId: "br1",
				totalAmount: 50,
			})
		).rejects.toThrow("Failed to create sales order");
	});
});

describe("updateSalesOrder", () => {
	test("updates and returns the order", async () => {
		const updatedOrder = { id: "so1", customerName: "Alice Updated", status: "confirmed" };
		const mockReturningUpd = mock(() => Promise.resolve([updatedOrder]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateSalesOrder(mockTenantDb, "so1", { customerName: "Alice Updated", status: "confirmed" });

		expect(result).toEqual(updatedOrder);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Sales order not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(updateSalesOrder(mockTenantDb, "nonexistent", { customerName: "X" })).rejects.toThrow(
			"Sales order not found"
		);
	});
});

describe("cancelSalesOrder", () => {
	test("throws 'Sales order not found' when order does not exist", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		await expect(
			cancelSalesOrder(mockTenantDb, "nonexistent", { cancelledBy: "user-1", refundAmount: 100 })
		).rejects.toThrow("Sales order not found");
	});

	test("executes transaction with update and insert when order exists", async () => {
		const mockOrder = { id: "so1", customerName: "Alice", customerId: null };
		const mockCancelledSale = { id: "cs1", cancellationNumber: "CAN-20260227-0001" };

		// getSalesOrderById internal call
		mockFindFirst.mockResolvedValueOnce(mockOrder);

		// generateCancellationNumber count query → total=0
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		// Mock transaction to run callback with custom tx mocks
		const txReturningOrder = mock(() => Promise.resolve([{ ...mockOrder, status: "cancelled" }]));
		const txWhereOrder = mock(() => ({ returning: txReturningOrder }));
		const txSetOrder = mock(() => ({ where: txWhereOrder }));
		const txUpdate = mock(() => ({ set: txSetOrder }));

		const txReturningInsert = mock(() => Promise.resolve([mockCancelledSale]));
		const txValuesInsert = mock(() => ({ returning: txReturningInsert }));
		const txInsert = mock(() => ({ values: txValuesInsert }));

		mockTransaction.mockImplementationOnce(async (fn: any) => {
			return fn({ update: txUpdate, insert: txInsert });
		});

		const result = await cancelSalesOrder(mockTenantDb, "so1", {
			cancelledBy: "user-1",
			refundAmount: 100,
		});

		expect(result.salesOrder).toBeDefined();
		expect(result.cancelledSale).toBeDefined();
		expect(mockTransaction).toHaveBeenCalledTimes(1);
		expect(txUpdate).toHaveBeenCalledTimes(1);
		expect(txInsert).toHaveBeenCalledTimes(1);
	});

	test("passes cancellation reason and refundAmount to cancelledSale insert", async () => {
		const mockOrder = { id: "so2", customerName: "Bob", customerId: "cust-2" };
		const mockCancelledSale = { id: "cs2", cancellationNumber: "CAN-20260227-0001" };

		mockFindFirst.mockResolvedValueOnce(mockOrder);
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const txReturningOrder = mock(() => Promise.resolve([{ ...mockOrder, status: "cancelled" }]));
		const txWhereOrder = mock(() => ({ returning: txReturningOrder }));
		const txSetOrder = mock(() => ({ where: txWhereOrder }));
		const txUpdate = mock(() => ({ set: txSetOrder }));

		const txReturningInsert = mock(() => Promise.resolve([mockCancelledSale]));
		const txValuesInsert = mock(() => ({ returning: txReturningInsert }));
		const txInsert = mock(() => ({ values: txValuesInsert }));

		mockTransaction.mockImplementationOnce(async (fn: any) => {
			return fn({ update: txUpdate, insert: txInsert });
		});

		await cancelSalesOrder(mockTenantDb, "so2", {
			cancelledBy: "user-2",
			reason: "Customer request",
			refundAmount: 200,
		});

		const insertValuesArg = txValuesInsert.mock.calls[0][0];
		expect(insertValuesArg.cancelledAmount).toBe(200);
		expect(insertValuesArg.cancellationReason).toBe("Customer request");
		expect(insertValuesArg.cancelledBy).toBe("user-2");
	});
});
