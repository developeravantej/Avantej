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

		await createSalesOrder(mockTenantDb, {
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

	test("updates sales order with cancellation metadata and returns it directly", async () => {
		const mockOrder = { id: "so1", customerName: "Alice", customerId: null };
		const cancelledOrder = {
			...mockOrder,
			status: "cancelled",
			cancellationNumber: "CAN-20260227-0001",
			cancellationDate: new Date(),
			cancellationReason: null,
			cancelledBy: "user-1",
		};

		// getSalesOrderById internal call
		mockFindFirst.mockResolvedValueOnce(mockOrder);

		// generateCancellationNumber count query → total=0
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		// update returning cancelled order
		const mockReturningUpd = mock(() => Promise.resolve([cancelledOrder]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await cancelSalesOrder(mockTenantDb, "so1", {
			cancelledBy: "user-1",
			refundAmount: 100,
		});

		expect(result).toBeDefined();
		expect(result.status).toBe("cancelled");
		expect(result.cancellationNumber).toBe("CAN-20260227-0001");
		expect(result.cancelledBy).toBe("user-1");
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		// No transaction used — no insert into cancelled_sales
		expect(mockInsert).not.toHaveBeenCalled();
	});

	test("passes cancellation reason to update set", async () => {
		const mockOrder = { id: "so2", customerName: "Bob", customerId: "cust-2" };
		const cancelledOrder = {
			...mockOrder,
			status: "cancelled",
			cancellationNumber: "CAN-20260227-0001",
			cancellationDate: new Date(),
			cancellationReason: "Customer request",
			cancelledBy: "user-2",
		};

		mockFindFirst.mockResolvedValueOnce(mockOrder);
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const mockReturningUpd = mock(() => Promise.resolve([cancelledOrder]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const capturedSet: any[] = [];
		const mockSetUpd = mock((setArg: any) => {
			capturedSet.push(setArg);
			return { where: mockWhereUpd };
		});
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await cancelSalesOrder(mockTenantDb, "so2", {
			cancelledBy: "user-2",
			reason: "Customer request",
			refundAmount: 200,
		});

		expect(result.cancellationReason).toBe("Customer request");
		expect(result.cancelledBy).toBe("user-2");

		// Verify the set() call included cancellation fields
		const setArg = capturedSet[0];
		expect(setArg.status).toBe("cancelled");
		expect(setArg.cancellationReason).toBe("Customer request");
		expect(setArg.cancelledBy).toBe("user-2");
		expect(setArg.cancellationNumber).toMatch(/CAN-\d{8}-0001/);
	});

	test("persists refundAmount to cancelled_amount column", async () => {
		const mockOrder = {
			id: "so3",
			customerName: "Carol",
			customerId: "cust-3",
			totalAmount: 10000,
		};
		const cancelledOrder = {
			...mockOrder,
			status: "cancelled",
			cancellationNumber: "CAN-20260412-0001",
			cancellationDate: new Date(),
			cancelledAmount: 5000,
			cancelledBy: "user-3",
		};

		mockFindFirst.mockResolvedValueOnce(mockOrder);
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const mockReturningUpd = mock(() => Promise.resolve([cancelledOrder]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const capturedSet: any[] = [];
		const mockSetUpd = mock((setArg: any) => {
			capturedSet.push(setArg);
			return { where: mockWhereUpd };
		});
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await cancelSalesOrder(mockTenantDb, "so3", {
			cancelledBy: "user-3",
			refundAmount: 5000, // partial refund — half of totalAmount
		});

		// The set() call must write cancelled_amount with the partial refund value
		const setArg = capturedSet[0];
		expect(setArg.cancelledAmount).toBe(5000);

		// Returned order reflects the persisted partial amount
		expect(result.cancelledAmount).toBe(5000);
	});

	test("throws when refundAmount exceeds totalAmount", async () => {
		const mockOrder = {
			id: "so4",
			customerName: "Dave",
			customerId: "cust-4",
			totalAmount: 10000,
		};
		mockFindFirst.mockResolvedValueOnce(mockOrder);

		await expect(
			cancelSalesOrder(mockTenantDb, "so4", {
				cancelledBy: "user-4",
				refundAmount: 20000, // > totalAmount
			})
		).rejects.toThrow(/out of range/);

		// update() must not have been called — validation happens before the DB write
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("throws when refundAmount is negative", async () => {
		const mockOrder = {
			id: "so5",
			customerName: "Eve",
			customerId: "cust-5",
			totalAmount: 10000,
		};
		mockFindFirst.mockResolvedValueOnce(mockOrder);

		await expect(
			cancelSalesOrder(mockTenantDb, "so5", {
				cancelledBy: "user-5",
				refundAmount: -100,
			})
		).rejects.toThrow(/out of range/);

		expect(mockUpdate).not.toHaveBeenCalled();
	});
});
