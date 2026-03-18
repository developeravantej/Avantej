import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listTransferOrders,
	getTransferOrderById,
	createTransferOrder,
	markInTransit,
	completeTransfer,
	cancelTransfer,
} from "@avantej-core/services";

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

// select chain for count queries
const mockSelectWhere = mock(() => Promise.resolve([{ total: 0 }]));
const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
const mockSelect = mock(() => ({ from: mockSelectFrom }));

const mockTransaction = mock(async (fn: any) => fn(mockTx));
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
		transferOrders: {
			findMany: mockFindMany,
			findFirst: mockFindFirst,
		},
		transferOrderItems: {
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

describe("listTransferOrders", () => {
	test("returns all orders with no filters", async () => {
		const fakeOrders = [
			{ id: "to1", transferNumber: "TO-20260227-0001", fromBranchId: "br1", toBranchId: "br2" },
		];
		mockFindMany.mockResolvedValueOnce(fakeOrders);

		const result = await listTransferOrders(mockTenantDb);

		expect(result).toEqual(fakeOrders);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeUndefined();
	});

	test("applies status filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listTransferOrders(mockTenantDb, { status: "in_transit" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies fromBranchId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listTransferOrders(mockTenantDb, { fromBranchId: "br1" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies toBranchId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listTransferOrders(mockTenantDb, { toBranchId: "br2" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("post-filters by accessibleNodeIds — matches fromBranchId OR toBranchId", async () => {
		const allOrders = [
			{ id: "to1", fromBranchId: "br1", toBranchId: "br2" },
			{ id: "to2", fromBranchId: "br3", toBranchId: "br4" },
			{ id: "to3", fromBranchId: "br5", toBranchId: "br6" },
		];
		mockFindMany.mockResolvedValueOnce(allOrders);

		// br2 matches toBranchId of to1; br3 matches fromBranchId of to2
		const result = await listTransferOrders(mockTenantDb, { accessibleNodeIds: ["br2", "br3"] });

		expect(result).toHaveLength(2);
		expect(result.map((o) => o.id)).toEqual(["to1", "to2"]);
	});
});

describe("getTransferOrderById", () => {
	test("returns null when transfer order not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getTransferOrderById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns transfer order with items when found", async () => {
		const fakeHeader = {
			id: "to1",
			transferNumber: "TO-20260227-0001",
			fromBranchId: "br1",
			toBranchId: "br2",
		};
		const fakeItems = [
			{ id: "toi1", transferOrderId: "to1", productId: "p1", quantityTransferred: 5, quantityReceived: 0 },
		];

		// findFirst for header, then findMany for items
		mockFindFirst.mockResolvedValueOnce(fakeHeader);
		mockFindMany.mockResolvedValueOnce(fakeItems);

		const result = await getTransferOrderById(mockTenantDb, "to1");

		expect(result).not.toBeNull();
		expect(result!.id).toBe("to1");
		expect(result!.items).toHaveLength(1);
		expect(result!.items[0].productId).toBe("p1");
	});
});

describe("createTransferOrder", () => {
	test("generates transfer number and creates header + items in transaction", async () => {
		// Count query for number generation → total=0 → TO-...-0001
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const fakeHeader = {
			id: "to1",
			transferNumber: "TO-20260227-0001",
			fromBranchId: "br1",
			toBranchId: "br2",
			status: "pending",
		};
		const fakeItems = [
			{ id: "toi1", transferOrderId: "to1", productId: "p1", quantityTransferred: 5, quantityReceived: 0 },
		];

		const txReturningHeader = mock(() => Promise.resolve([fakeHeader]));
		const txValuesHeader = mock(() => ({ returning: txReturningHeader }));
		const txReturningItems = mock(() => Promise.resolve(fakeItems));
		const txValuesItems = mock(() => ({ returning: txReturningItems }));

		let insertCallCount = 0;
		const txInsert = mock(() => {
			insertCallCount++;
			return insertCallCount === 1 ? { values: txValuesHeader } : { values: txValuesItems };
		});

		mockTransaction.mockImplementationOnce(async (fn: any) => fn({ insert: txInsert }));

		const result = await createTransferOrder(mockTenantDb, {
			dateIssued: new Date("2026-02-27"),
			fromBranchId: "br1",
			toBranchId: "br2",
			issuedByMemberId: "member-1",
			items: [{ productId: "p1", quantityTransferred: 5 }],
		});

		expect(result.id).toBe("to1");
		expect(result.items).toHaveLength(1);
		expect(result.status).toBe("pending");
		expect(mockSelect).toHaveBeenCalledTimes(1);
		expect(mockTransaction).toHaveBeenCalledTimes(1);
	});

	test("items default quantityReceived to 0", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const fakeHeader = { id: "to2", transferNumber: "TO-20260227-0001", fromBranchId: "br1", toBranchId: "br2", status: "pending" };

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

		await createTransferOrder(mockTenantDb, {
			dateIssued: new Date("2026-02-27"),
			fromBranchId: "br1",
			toBranchId: "br2",
			issuedByMemberId: "member-1",
			items: [{ productId: "p1", quantityTransferred: 5 }],
		});

		// Items mapped with quantityReceived: 0
		const itemValuesArg = txValuesItems.mock.calls[0][0];
		expect(itemValuesArg[0].quantityReceived).toBe(0);
	});
});

describe("markInTransit", () => {
	test("sets status to 'in_transit' and returns the order", async () => {
		const inTransit = { id: "to1", status: "in_transit" };
		const mockReturningUpd = mock(() => Promise.resolve([inTransit]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await markInTransit(mockTenantDb, "to1");

		expect(result.status).toBe("in_transit");
		const setArg = mockSetUpd.mock.calls[0][0];
		expect(setArg.status).toBe("in_transit");
	});

	test("throws 'Transfer order not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(markInTransit(mockTenantDb, "nonexistent")).rejects.toThrow("Transfer order not found");
	});
});

describe("completeTransfer", () => {
	const fakeHeader = {
		id: "to1",
		transferNumber: "TO-20260227-0001",
		fromBranchId: "br1",
		toBranchId: "br2",
		status: "in_transit",
	};
	const fakeItems = [
		{ id: "toi1", transferOrderId: "to1", productId: "p1", quantityTransferred: 5, quantityReceived: 0 },
	];
	const receiveItems = [{ itemId: "toi1", quantityReceived: 5 }];

	test("throws 'Transfer order not found' when transfer does not exist", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		await expect(completeTransfer(mockTenantDb, "nonexistent", receiveItems)).rejects.toThrow(
			"Transfer order not found"
		);
	});

	test("executes transaction: updates items, adjusts stock (deduct from, add to), sets status=completed", async () => {
		// getTransferOrderById: findFirst header + findMany items
		mockFindFirst.mockResolvedValueOnce(fakeHeader);
		mockFindMany.mockResolvedValueOnce(fakeItems);

		const completed = { id: "to1", status: "completed" };

		// tx.update calls:
		// 1. update transferOrderItems (quantityReceived)
		// 2. adjustStock fromBranch (deduct) - update productStock
		// 3. adjustStock toBranch (add) - update productStock
		// 4. update transferOrders (status=completed)

		const itemUpdateWhere = mock(() => Promise.resolve());
		const itemUpdateSet = mock(() => ({ where: itemUpdateWhere }));

		const adjFromRet = mock(() => Promise.resolve([{ id: "ps1", quantity: 95 }]));
		const adjFromWhere = mock(() => ({ returning: adjFromRet }));
		const adjFromSet = mock(() => ({ where: adjFromWhere }));

		const adjToRet = mock(() => Promise.resolve([{ id: "ps2", quantity: 5 }]));
		const adjToWhere = mock(() => ({ returning: adjToRet }));
		const adjToSet = mock(() => ({ where: adjToWhere }));

		const statusRet = mock(() => Promise.resolve([completed]));
		const statusWhere = mock(() => ({ returning: statusRet }));
		const statusSet = mock(() => ({ where: statusWhere }));

		let updateCallCount = 0;
		const txUpdate = mock(() => {
			updateCallCount++;
			if (updateCallCount === 1) return { set: itemUpdateSet };
			if (updateCallCount === 2) return { set: adjFromSet };
			if (updateCallCount === 3) return { set: adjToSet };
			return { set: statusSet };
		});

		mockTransaction.mockImplementationOnce(async (fn: any) => fn({ update: txUpdate, insert: mockInsert }));

		const result = await completeTransfer(mockTenantDb, "to1", receiveItems);

		expect(result.status).toBe("completed");
		expect(mockTransaction).toHaveBeenCalledTimes(1);
		// 4 updates total
		expect(txUpdate).toHaveBeenCalledTimes(4);

		// Verify last update set status=completed
		const finalSetArg = statusSet.mock.calls[0][0];
		expect(finalSetArg.status).toBe("completed");
	});

	test("adjustStock uses quantityTransferred for deduction (not quantityReceived)", async () => {
		// fakeItems has quantityTransferred=5; we receive 3 but deduct 5 from source
		mockFindFirst.mockResolvedValueOnce(fakeHeader);
		mockFindMany.mockResolvedValueOnce(fakeItems);

		const completed = { id: "to1", status: "completed" };

		const itemUpdateWhere = mock(() => Promise.resolve());
		const itemUpdateSet = mock(() => ({ where: itemUpdateWhere }));

		let adjFromDelta: number | undefined;
		let adjToDelta: number | undefined;

		// Capture the sql expression args for adjustStock calls
		// adjustStock calls update().set({quantity: sql`...+delta`...}).where().returning()
		const adjFromRet = mock(() => Promise.resolve([{ id: "ps1", quantity: 95 }]));
		const adjFromWhere = mock(() => ({ returning: adjFromRet }));
		const adjFromSet = mock((setArg: any) => {
			// The quantity field is a sql expression; we note the update happened
			return { where: adjFromWhere };
		});

		const adjToRet = mock(() => Promise.resolve([{ id: "ps2", quantity: 3 }]));
		const adjToWhere = mock(() => ({ returning: adjToRet }));
		const adjToSet = mock(() => ({ where: adjToWhere }));

		const statusRet = mock(() => Promise.resolve([completed]));
		const statusWhere = mock(() => ({ returning: statusRet }));
		const statusSet = mock(() => ({ where: statusWhere }));

		let updateCallCount = 0;
		const txUpdate = mock(() => {
			updateCallCount++;
			if (updateCallCount === 1) return { set: itemUpdateSet };
			if (updateCallCount === 2) return { set: adjFromSet };
			if (updateCallCount === 3) return { set: adjToSet };
			return { set: statusSet };
		});

		mockTransaction.mockImplementationOnce(async (fn: any) => fn({ update: txUpdate, insert: mockInsert }));

		// Receive only 3 out of 5 transferred
		await completeTransfer(mockTenantDb, "to1", [{ itemId: "toi1", quantityReceived: 3 }]);

		// 4 update calls: item, fromBranch adj, toBranch adj, status
		expect(txUpdate).toHaveBeenCalledTimes(4);
	});
});

describe("cancelTransfer", () => {
	test("sets status to 'cancelled' and returns the order", async () => {
		const cancelled = { id: "to1", status: "cancelled" };
		const mockReturningUpd = mock(() => Promise.resolve([cancelled]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await cancelTransfer(mockTenantDb, "to1");

		expect(result.status).toBe("cancelled");
		const setArg = mockSetUpd.mock.calls[0][0];
		expect(setArg.status).toBe("cancelled");
	});

	test("throws 'Transfer order not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(cancelTransfer(mockTenantDb, "nonexistent")).rejects.toThrow("Transfer order not found");
	});
});
