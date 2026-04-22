import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listSalesOrders,
	getSalesOrderById,
	createSalesOrder,
	updateSalesOrder,
	cancelSalesOrder,
} from "@avantej-core/services";

// Mock actor used for cancelSalesOrder calls
const MOCK_ACTOR = { userId: "user-1", memberId: "member-1", role: "admin" };

// Shared mocks
const mockFindFirst = mock(() => Promise.resolve(null));
const mockReturning = mock(() => Promise.resolve([]));
const mockValues = mock(() => ({ returning: mockReturning }));
const mockInsert = mock(() => ({ values: mockValues }));
const mockUpdate = mock(() => ({
	set: mock(() => ({
		where: mock(() => ({ returning: mockReturning })),
	})),
}));

// select().from().where() chain — used by:
//   - generateSalesOrderNumber (count query)
//   - generateCancellationNumber (count query)
//   - listSalesOrders (count query + row query)
//
// The row query also chains .orderBy().limit().offset() — each returns the same mock
// so we can resolve the full chain.

const mockOffset = mock(() => Promise.resolve([]));
const mockLimit = mock(() => ({ offset: mockOffset }));
const mockOrderBy = mock(() => ({ limit: mockLimit }));
// where() is used both as terminal (count queries resolve immediately) and as
// the start of orderBy chain. We give it a dual-return: the Promise also has
// .orderBy on it so the chain works. We handle this via mockImplementation per test.
const mockSelectWhere = mock(() => Promise.resolve([{ total: 0 }]));
const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
const mockSelect = mock(() => ({ from: mockSelectFrom }));

// We override mockSelectWhere behaviour per test to return either:
//   - [{total: N}] for count queries
//   - An object with .orderBy for row queries
// Since listSalesOrders runs both in Promise.all, we use mockImplementation
// to return different things per call within a test.

// transaction mock: calls the callback with a tx that mirrors the top-level db mock
const mockTransaction = mock(async (cb: (tx: any) => Promise<any>) => {
	const tx = {
		update: mockUpdate,
		select: mockSelect,
		insert: mockInsert,
	};
	return cb(tx);
});

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	select: mockSelect,
	transaction: mockTransaction,
	query: {
		salesOrders: {
			findFirst: mockFindFirst,
		},
	},
} as any;

beforeEach(() => {
	mockFindFirst.mockClear();
	mockReturning.mockClear();
	mockValues.mockClear();
	mockInsert.mockClear();
	mockUpdate.mockClear();
	mockSelectWhere.mockClear();
	mockSelectFrom.mockClear();
	mockSelect.mockClear();
	mockOffset.mockClear();
	mockLimit.mockClear();
	mockOrderBy.mockClear();
	mockTransaction.mockClear();
});

// Helper: set up the mock chain for listSalesOrders which calls
// Promise.all([countQuery, rowQuery]).
// countQuery: select({total}).from(t).where(...) → [{total}]
// rowQuery:   select().from(t).where(...).orderBy(...).limit(...).offset(...) → rows
//
// mockSelectWhere is called once per query. We use consecutive implementations:
// first call = count query (terminal Promise), second call = row query (returns orderBy chain).
function setupListMock(total: number, rows: any[]) {
	// First call to where() → count result
	mockSelectWhere.mockImplementationOnce(() => Promise.resolve([{ total }]));
	// Second call to where() → orderBy chain
	mockSelectWhere.mockImplementationOnce(() => ({
		orderBy: mock(() => ({
			limit: mock(() => ({
				offset: mock(() => Promise.resolve(rows)),
			})),
		})),
	}));
}

describe("listSalesOrders", () => {
	test("returns all orders with no filters", async () => {
		const fakeOrders = [
			{ id: "so1", salesOrderNumber: "SO-20260227-0001", branchId: "br1" },
		];
		setupListMock(1, fakeOrders);

		const result = await listSalesOrders(mockTenantDb);

		expect(result.rows).toEqual(fakeOrders);
		expect(result.total).toBe(1);
	});

	test("applies status filter", async () => {
		setupListMock(0, []);

		const result = await listSalesOrders(mockTenantDb, { status: "confirmed" });

		expect(result.rows).toEqual([]);
		expect(result.total).toBe(0);
		// where() was called twice (count + rows)
		expect(mockSelectWhere).toHaveBeenCalledTimes(2);
	});

	test("applies customerId filter", async () => {
		setupListMock(0, []);

		const result = await listSalesOrders(mockTenantDb, { customerId: "cust-1" });

		expect(result.rows).toEqual([]);
		expect(mockSelectWhere).toHaveBeenCalledTimes(2);
	});

	test("applies date range filters", async () => {
		setupListMock(0, []);

		const from = new Date("2026-01-01");
		const to = new Date("2026-01-31");
		const result = await listSalesOrders(mockTenantDb, { from, to });

		expect(result.rows).toEqual([]);
		expect(mockSelectWhere).toHaveBeenCalledTimes(2);
	});

	test("returns empty result immediately when accessibleNodeIds is empty (no DB call)", async () => {
		const result = await listSalesOrders(mockTenantDb, { accessibleNodeIds: [] });

		expect(result).toEqual({ rows: [], total: 0 });
		// No DB queries should have been made
		expect(mockSelect).not.toHaveBeenCalled();
	});

	test("throws FORBIDDEN when branchId is not in accessibleNodeIds", async () => {
		await expect(
			listSalesOrders(mockTenantDb, {
				accessibleNodeIds: ["br1"],
				branchId: "br2",
			})
		).rejects.toThrow("FORBIDDEN: branch not in accessible scope");

		expect(mockSelect).not.toHaveBeenCalled();
	});

	test("filters SQL-side when accessibleNodeIds is non-empty", async () => {
		const fakeOrders = [
			{ id: "so1", branchId: "br1" },
			{ id: "so3", branchId: "br3" },
		];
		setupListMock(2, fakeOrders);

		const result = await listSalesOrders(mockTenantDb, { accessibleNodeIds: ["br1", "br3"] });

		expect(result.rows).toHaveLength(2);
		expect(result.total).toBe(2);
		// Both count and row queries went through the DB (inArray pushed into WHERE)
		expect(mockSelectWhere).toHaveBeenCalledTimes(2);
	});

	test("pagination: limit and offset are passed through", async () => {
		// Capture offset mock to verify it was called
		const fakeRows = [{ id: "so2", branchId: "br1" }];
		const mockOffsetCapture = mock(() => Promise.resolve(fakeRows));
		const mockLimitCapture = mock(() => ({ offset: mockOffsetCapture }));
		const mockOrderByCapture = mock(() => ({ limit: mockLimitCapture }));

		mockSelectWhere.mockImplementationOnce(() => Promise.resolve([{ total: 10 }]));
		mockSelectWhere.mockImplementationOnce(() => ({
			orderBy: mockOrderByCapture,
		}));

		const result = await listSalesOrders(mockTenantDb, { limit: 2, offset: 4 });

		expect(result.total).toBe(10);
		expect(result.rows).toEqual(fakeRows);
		expect(mockLimitCapture).toHaveBeenCalledWith(2);
		expect(mockOffsetCapture).toHaveBeenCalledWith(4);
	});

	test("defaults limit=50 offset=0 when not provided", async () => {
		const mockOffsetCapture = mock(() => Promise.resolve([]));
		const mockLimitCapture = mock(() => ({ offset: mockOffsetCapture }));
		const mockOrderByCapture = mock(() => ({ limit: mockLimitCapture }));

		mockSelectWhere.mockImplementationOnce(() => Promise.resolve([{ total: 0 }]));
		mockSelectWhere.mockImplementationOnce(() => ({
			orderBy: mockOrderByCapture,
		}));

		await listSalesOrders(mockTenantDb);

		expect(mockLimitCapture).toHaveBeenCalledWith(50);
		expect(mockOffsetCapture).toHaveBeenCalledWith(0);
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
			cancelSalesOrder(mockTenantDb, "nonexistent", { cancelledBy: "user-1", refundAmount: 100 }, MOCK_ACTOR)
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
		}, MOCK_ACTOR);

		expect(result).toBeDefined();
		expect(result.status).toBe("cancelled");
		expect(result.cancellationNumber).toBe("CAN-20260227-0001");
		expect(result.cancelledBy).toBe("user-1");
		// update() is called at least once (for the sales order itself; commission splits may also call it)
		expect(mockUpdate).toHaveBeenCalled();
		// writeAudit inside the transaction calls insert(auditLogs)
		expect(mockTransaction).toHaveBeenCalledTimes(1);
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
		}, MOCK_ACTOR);

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
		}, MOCK_ACTOR);

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
			}, MOCK_ACTOR)
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
			}, MOCK_ACTOR)
		).rejects.toThrow(/out of range/);

		expect(mockUpdate).not.toHaveBeenCalled();
	});
});
