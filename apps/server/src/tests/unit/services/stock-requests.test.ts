import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listStockRequests,
	getStockRequestById,
	createStockRequest,
	approveStockRequest,
	rejectStockRequest,
	fulfillStockRequest,
} from "@avantej-core/services";

// Shared mocks
const mockFindMany = mock<(...args: any[]) => Promise<any>>(() => Promise.resolve([]));
const mockFindFirst = mock<(...args: any[]) => Promise<any>>(() => Promise.resolve(null));
const mockReturning = mock<(...args: any[]) => Promise<any>>(() => Promise.resolve([]));
const mockValues = mock<(...args: any[]) => any>(() => ({ returning: mockReturning }));
const mockInsert = mock<(...args: any[]) => any>(() => ({ values: mockValues }));
const mockUpdate = mock<(...args: any[]) => any>(() => ({
	set: mock(() => ({
		where: mock(() => ({ returning: mockReturning })),
	})),
}));

// select chain for count queries
const mockSelectWhere = mock<(...args: any[]) => Promise<any>>(() => Promise.resolve([{ total: 0 }]));
const mockSelectFrom = mock<(...args: any[]) => any>(() => ({ where: mockSelectWhere }));
const mockSelect = mock<(...args: any[]) => any>(() => ({ from: mockSelectFrom }));

const mockTransaction = mock<(fn: any) => Promise<any>>(async (fn: any) => fn(mockTx));
const mockTx = {
	insert: mockInsert,
	update: mockUpdate,
	select: mockSelect,
};

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	select: mockSelect,
	query: {
		stockRequests: {
			findMany: mockFindMany,
			findFirst: mockFindFirst,
		},
		stockRequestItems: {
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

describe("listStockRequests", () => {
	test("returns all requests with no filters", async () => {
		const fakeRequests = [{ id: "sr1", requestNumber: "SR-20260227-0001", toBranchId: "br1" }];
		mockFindMany.mockResolvedValueOnce(fakeRequests);

		const result = await listStockRequests(mockTenantDb);

		expect(result as any).toEqual(fakeRequests);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeUndefined();
	});

	test("applies status filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listStockRequests(mockTenantDb, { status: "pending" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies fromBranchId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listStockRequests(mockTenantDb, { fromBranchId: "br1" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies toBranchId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listStockRequests(mockTenantDb, { toBranchId: "br2" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("post-filters by accessibleNodeIds (matches toBranchId)", async () => {
		const allRequests = [
			{ id: "sr1", toBranchId: "br1" },
			{ id: "sr2", toBranchId: "br2" },
			{ id: "sr3", toBranchId: "br3" },
		];
		mockFindMany.mockResolvedValueOnce(allRequests);

		const result = await listStockRequests(mockTenantDb, { accessibleNodeIds: ["br1", "br3"] });

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.id)).toEqual(["sr1", "sr3"]);
	});
});

describe("getStockRequestById", () => {
	test("returns null when request not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getStockRequestById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns request with items when header found", async () => {
		const fakeHeader = { id: "sr1", requestNumber: "SR-20260227-0001", toBranchId: "br1" };
		const fakeItems = [
			{ id: "sri1", stockRequestId: "sr1", productId: "p1", quantityRequested: 10 },
			{ id: "sri2", stockRequestId: "sr1", productId: "p2", quantityRequested: 5 },
		];

		// First call: findFirst for header
		mockFindFirst.mockResolvedValueOnce(fakeHeader);
		// Second call: findMany for items
		mockFindMany.mockResolvedValueOnce(fakeItems);

		const result = await getStockRequestById(mockTenantDb, "sr1");

		expect(result).not.toBeNull();
		expect(result!.id).toBe("sr1");
		expect(result!.items).toHaveLength(2);
		expect(result!.items[0]!.productId).toBe("p1");
	});
});

describe("createStockRequest", () => {
	test("generates request number and creates header + items in transaction", async () => {
		// Count query for number generation
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const fakeHeader = {
			id: "sr1",
			requestNumber: "SR-20260227-0001",
			toBranchId: "br1",
			status: "pending",
		};
		const fakeItems = [
			{ id: "sri1", stockRequestId: "sr1", productId: "p1", quantityRequested: 10, quantityFulfilled: 0 },
		];

		// Mock transaction: runs callback with tx that has insert
		const txReturningHeader = mock(() => Promise.resolve([fakeHeader]));
		const txValuesHeader = mock(() => ({ returning: txReturningHeader }));
		const txReturningItems = mock(() => Promise.resolve(fakeItems));
		const txValuesItems = mock(() => ({ returning: txReturningItems }));

		let insertCallCount = 0;
		const txInsert = mock(() => {
			insertCallCount++;
			if (insertCallCount === 1) {
				return { values: txValuesHeader };
			}
			return { values: txValuesItems };
		});

		mockTransaction.mockImplementationOnce(async (fn: any) => {
			return fn({ insert: txInsert });
		});

		const result = await createStockRequest(mockTenantDb, {
			dateIssued: new Date("2026-02-27"),
			issuedByMemberId: "member-1",
			toBranchId: "br1",
			items: [{ productId: "p1", quantityRequested: 10 }],
		});

		expect(result.id).toBe("sr1");
		expect(result.items).toHaveLength(1);
		expect(result.status).toBe("pending");
		expect(mockSelect).toHaveBeenCalledTimes(1); // number generation
		expect(mockTransaction).toHaveBeenCalledTimes(1);
	});

	test("includes fromBranchId when provided", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const fakeHeader = { id: "sr2", requestNumber: "SR-20260227-0001", fromBranchId: "br0", toBranchId: "br1", status: "pending" };
		const txReturningHeader = mock(() => Promise.resolve([fakeHeader]));
		const txValuesHeader = mock(() => ({ returning: txReturningHeader }));
		const txReturningItems = mock(() => Promise.resolve([]));
		const txValuesItems = mock(() => ({ returning: txReturningItems }));

		let insertCallCount = 0;
		const txInsert = mock(() => {
			insertCallCount++;
			return insertCallCount === 1 ? { values: txValuesHeader } : { values: txValuesItems };
		});

		mockTransaction.mockImplementationOnce(async (fn: any) => fn({ insert: txInsert }));

		await createStockRequest(mockTenantDb, {
			dateIssued: new Date("2026-02-27"),
			issuedByMemberId: "member-1",
			fromBranchId: "br0",
			toBranchId: "br1",
			items: [],
		});

		const headerValuesArg = ((txValuesHeader as any).mock.calls[0] ?? [])[0];
		expect(headerValuesArg!.fromBranchId).toBe("br0");
	});
});

describe("approveStockRequest", () => {
	test("updates status to 'approved' and returns the request", async () => {
		const approved = { id: "sr1", status: "approved" };
		const mockReturningUpd = mock(() => Promise.resolve([approved]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await approveStockRequest(mockTenantDb, "sr1");

		expect(result.status).toBe("approved");
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		const setArg = ((mockSetUpd as any).mock.calls[0] ?? [])[0];
		expect(setArg!.status).toBe("approved");
	});

	test("throws 'Stock request not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(approveStockRequest(mockTenantDb, "nonexistent")).rejects.toThrow("Stock request not found");
	});
});

describe("rejectStockRequest", () => {
	test("updates status to 'rejected' and returns the request", async () => {
		const rejected = { id: "sr1", status: "rejected" };
		const mockReturningUpd = mock(() => Promise.resolve([rejected]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await rejectStockRequest(mockTenantDb, "sr1");

		expect(result.status).toBe("rejected");
		const setArg = ((mockSetUpd as any).mock.calls[0] ?? [])[0];
		expect(setArg!.status).toBe("rejected");
	});

	test("throws 'Stock request not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(rejectStockRequest(mockTenantDb, "nonexistent")).rejects.toThrow("Stock request not found");
	});
});

describe("fulfillStockRequest", () => {
	const fakeHeader = {
		id: "sr1",
		requestNumber: "SR-20260227-0001",
		fromBranchId: "br0",
		toBranchId: "br1",
		status: "approved",
	};
	const fakeItems = [
		{ id: "sri1", stockRequestId: "sr1", productId: "p1", quantityRequested: 10, quantityFulfilled: 0 },
	];
	const fulfillItems = [{ itemId: "sri1", quantityFulfilled: 8 }];

	test("throws 'Stock request not found' when request does not exist", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		await expect(fulfillStockRequest(mockTenantDb, "nonexistent", fulfillItems)).rejects.toThrow(
			"Stock request not found"
		);
	});

	test("WITH fromBranchId: deducts from source AND adds to destination", async () => {
		// getStockRequestById: findFirst (header) + findMany (items)
		mockFindFirst.mockResolvedValueOnce(fakeHeader);
		mockFindMany.mockResolvedValueOnce(fakeItems);

		const fulfilled = { id: "sr1", status: "fulfilled" };

		// adjustStock (for fromBranch deduct) → update().set().where().returning()
		const makeAdjustMock = () => {
			const ret = mock(() => Promise.resolve([{ id: "ps1", quantity: 90 }]));
			const wh = mock(() => ({ returning: ret }));
			const st = mock(() => ({ where: wh }));
			return { set: st, ret };
		};
		// adjustStock (for toBranch add)
		const makeAdjustMock2 = () => {
			const ret = mock(() => Promise.resolve([{ id: "ps2", quantity: 8 }]));
			const wh = mock(() => ({ returning: ret }));
			const st = mock(() => ({ where: wh }));
			return { set: st, ret };
		};
		// final status update
		const makeStatusMock = () => {
			const ret = mock(() => Promise.resolve([fulfilled]));
			const wh = mock(() => ({ returning: ret }));
			const st = mock(() => ({ where: wh }));
			return { set: st };
		};

		const adj1 = makeAdjustMock();
		const adj2 = makeAdjustMock2();
		const statusUpd = makeStatusMock();

		// tx.update.set for item fulfillment
		const itemUpdateWhere = mock(() => Promise.resolve());
		const itemUpdateSet = mock(() => ({ where: itemUpdateWhere }));

		let updateCallCount = 0;
		const txUpdate = mock(() => {
			updateCallCount++;
			// Call 1: item update (quantityFulfilled)
			// Call 2: adjustStock fromBranch (update)
			// Call 3: adjustStock toBranch (update)
			// Call 4: final status update
			if (updateCallCount === 1) return { set: itemUpdateSet };
			if (updateCallCount === 2) return { set: adj1.set };
			if (updateCallCount === 3) return { set: adj2.set };
			return { set: statusUpd.set };
		});

		mockTransaction.mockImplementationOnce(async (fn: any) => fn({ update: txUpdate, insert: mockInsert }));

		const result = await fulfillStockRequest(mockTenantDb, "sr1", fulfillItems);

		expect(result.status).toBe("fulfilled");
		expect(mockTransaction).toHaveBeenCalledTimes(1);
		// 4 updates: item + adjustStock fromBranch + adjustStock toBranch + status
		expect(txUpdate).toHaveBeenCalledTimes(4);
	});

	test("WITHOUT fromBranchId: only adds to destination, does not deduct from source", async () => {
		const headerNoFrom = { ...fakeHeader, fromBranchId: null };
		mockFindFirst.mockResolvedValueOnce(headerNoFrom);
		mockFindMany.mockResolvedValueOnce(fakeItems);

		const fulfilled = { id: "sr1", status: "fulfilled" };

		const itemUpdateWhere = mock(() => Promise.resolve());
		const itemUpdateSet = mock(() => ({ where: itemUpdateWhere }));

		// adjustStock for toBranch
		const adjRet = mock(() => Promise.resolve([{ id: "ps1", quantity: 8 }]));
		const adjWhere = mock(() => ({ returning: adjRet }));
		const adjSet = mock(() => ({ where: adjWhere }));

		// Final status update
		const statusRet = mock(() => Promise.resolve([fulfilled]));
		const statusWhere = mock(() => ({ returning: statusRet }));
		const statusSet = mock(() => ({ where: statusWhere }));

		let updateCallCount = 0;
		const txUpdate = mock(() => {
			updateCallCount++;
			if (updateCallCount === 1) return { set: itemUpdateSet };
			if (updateCallCount === 2) return { set: adjSet }; // only toBranch adjust
			return { set: statusSet }; // final status
		});

		mockTransaction.mockImplementationOnce(async (fn: any) => fn({ update: txUpdate, insert: mockInsert }));

		const result = await fulfillStockRequest(mockTenantDb, "sr1", fulfillItems);

		expect(result.status).toBe("fulfilled");
		// 3 updates: item + adjustStock toBranch only + status
		expect(txUpdate).toHaveBeenCalledTimes(3);
	});
});
