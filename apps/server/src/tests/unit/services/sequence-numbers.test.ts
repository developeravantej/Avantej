/**
 * Sequence Number Generation Tests
 *
 * Tests the document number generation helpers indirectly via public create functions.
 * Each document type uses the pattern: PREFIX-YYYYMMDD-NNNN (zero-padded 4 digits).
 *
 * Document types:
 *  - SO   (Sales Orders)       → createSalesOrder
 *  - CAN  (Cancelled Sales)    → cancelSalesOrder (via the cancellation number)
 *  - INV  (Invoices)           → createInvoice
 *  - SR   (Stock Requests)     → createStockRequest
 *  - TO   (Transfer Orders)    → createTransferOrder
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	createSalesOrder,
	cancelSalesOrder,
	createInvoice,
	createStockRequest,
	createTransferOrder,
} from "@avantej-core/services";

// --- Shared mocks ---
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

// select().from().where() → [{total: N}]
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
		salesOrders: { findMany: mockFindMany, findFirst: mockFindFirst },
		cancelledSales: { findMany: mockFindMany, findFirst: mockFindFirst },
		invoices: { findMany: mockFindMany, findFirst: mockFindFirst },
		stockRequests: { findMany: mockFindMany, findFirst: mockFindFirst },
		stockRequestItems: { findMany: mockFindMany, findFirst: mockFindFirst },
		transferOrders: { findMany: mockFindMany, findFirst: mockFindFirst },
		transferOrderItems: { findMany: mockFindMany, findFirst: mockFindFirst },
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

// Helper: extract the generated document number from the values arg
function getGeneratedNumber(mockValues: ReturnType<typeof mock>): string {
	const arg = mockValues.mock.calls[0][0];
	// Different services use different field names
	return (
		arg.salesOrderNumber ??
		arg.invoiceNumber ??
		arg.requestNumber ??
		arg.transferNumber ??
		""
	);
}

// Helper: set up a simple insert that returns a stub row with a specific number field
function setupInsertReturning(fieldName: string, numberValue: string) {
	mockReturning.mockResolvedValueOnce([
		{ id: "stub-id", [fieldName]: numberValue },
	]);
}

describe("SO — Sales Order number generation", () => {
	const baseParams = {
		date: new Date("2026-02-27"),
		customerName: "Test Customer",
		createdBy: "user-1",
		branchId: "br1",
		totalAmount: 100,
	};

	test("total=0 → sequence ends in 0001", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);
		setupInsertReturning("salesOrderNumber", "SO-20260227-0001");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.salesOrderNumber).toMatch(/SO-\d{8}-0001$/);
	});

	test("total=8 → sequence ends in 0009", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 8 }]);
		setupInsertReturning("salesOrderNumber", "SO-20260227-0009");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.salesOrderNumber).toMatch(/SO-\d{8}-0009$/);
	});

	test("total=9 → sequence ends in 0010", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 9 }]);
		setupInsertReturning("salesOrderNumber", "SO-20260227-0010");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.salesOrderNumber).toMatch(/SO-\d{8}-0010$/);
	});

	test("total=98 → sequence ends in 0099", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 98 }]);
		setupInsertReturning("salesOrderNumber", "SO-20260227-0099");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.salesOrderNumber).toMatch(/SO-\d{8}-0099$/);
	});

	test("date portion is embedded correctly (YYYYMMDD)", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);
		setupInsertReturning("salesOrderNumber", "SO-20260227-0001");

		await createSalesOrder(mockTenantDb, { ...baseParams, date: new Date("2026-02-27") });

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.salesOrderNumber).toMatch(/^SO-20260227-/);
	});
});

describe("CAN — Cancellation number generation (via cancelSalesOrder)", () => {
	function buildCanMocks(total: number, mockOrder: any) {
		const capturedSetArgs: any[] = [];
		const cancelledOrder = { ...mockOrder, status: "cancelled" };

		const canFindFirst = mock(() => Promise.resolve(mockOrder));
		const canSelectWhere = mock(() => Promise.resolve([{ total }]));
		const canSelectFrom = mock(() => ({ where: canSelectWhere }));
		const canSelect = mock(() => ({ from: canSelectFrom }));
		const canReturning = mock(() => Promise.resolve([cancelledOrder]));
		const canUpdate = mock(() => ({
			set: mock((setArg: any) => {
				capturedSetArgs.push(setArg);
				Object.assign(cancelledOrder, setArg);
				return {
					where: mock(() => ({ returning: canReturning })),
				};
			}),
		}));

		const db = {
			insert: mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([])) })) })),
			update: canUpdate,
			select: canSelect,
			query: {
				salesOrders: { findMany: mock(() => Promise.resolve([])), findFirst: canFindFirst },
			},
		} as any;

		return { db, capturedSetArgs };
	}

	test("total=0 → CAN number ends in 0001", async () => {
		const mockOrder = { id: "so1", customerName: "Alice", customerId: null, totalAmount: 500 };
		const { db, capturedSetArgs } = buildCanMocks(0, mockOrder);

		await cancelSalesOrder(db, "so1", { cancelledBy: "user-1", refundAmount: 100 });

		expect(capturedSetArgs[0].cancellationNumber).toMatch(/^CAN-\d{8}-0001$/);
	});

	test("total=9 → CAN number ends in 0010", async () => {
		const mockOrder = { id: "so1", customerName: "Alice", customerId: null, totalAmount: 500 };
		const { db, capturedSetArgs } = buildCanMocks(9, mockOrder);

		await cancelSalesOrder(db, "so1", { cancelledBy: "user-1", refundAmount: 50 });

		expect(capturedSetArgs[0].cancellationNumber).toMatch(/^CAN-\d{8}-0010$/);
	});
});

describe("INV — Invoice number generation", () => {
	const baseParams = {
		date: new Date("2026-02-27"),
		customerName: "Test Customer",
		createdBy: "user-1",
		totalAmount: 100,
		status: "draft" as const,
	};

	test("total=0 → INV number ends in 0001", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);
		setupInsertReturning("invoiceNumber", "INV-20260227-0001");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-0001$/);
	});

	test("total=8 → INV number ends in 0009", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 8 }]);
		setupInsertReturning("invoiceNumber", "INV-20260227-0009");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-0009$/);
	});

	test("total=9 → INV number ends in 0010", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 9 }]);
		setupInsertReturning("invoiceNumber", "INV-20260227-0010");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-0010$/);
	});

	test("total=98 → INV number ends in 0099", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 98 }]);
		setupInsertReturning("invoiceNumber", "INV-20260227-0099");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-0099$/);
	});

	test("does NOT call select when invoiceNumber is explicitly provided", async () => {
		setupInsertReturning("invoiceNumber", "INV-MANUAL-001");

		await createInvoice(mockTenantDb, { ...baseParams, invoiceNumber: "INV-MANUAL-001" });

		expect(mockSelect).not.toHaveBeenCalled();
	});
});

describe("SR — Stock Request number generation", () => {
	const makeStockRequestParams = () => ({
		dateIssued: new Date("2026-02-27"),
		issuedByMemberId: "member-1",
		toBranchId: "br1",
		items: [] as { productId: string; quantityRequested: number }[],
	});

	function buildSrMocks(total: number, numberValue: string) {
		const fakeHeader = { id: "sr1", requestNumber: numberValue, toBranchId: "br1", status: "pending" };
		const txReturningHeader = mock(() => Promise.resolve([fakeHeader]));
		const txValuesHeader = mock(() => ({ returning: txReturningHeader }));
		const txReturningItems = mock(() => Promise.resolve([]));
		const txValuesItems = mock(() => ({ returning: txReturningItems }));

		let insertCallCount = 0;
		const txInsert = mock(() => {
			insertCallCount++;
			return insertCallCount === 1 ? { values: txValuesHeader } : { values: txValuesItems };
		});

		const srSelectWhere = mock(() => Promise.resolve([{ total }]));
		const srSelectFrom = mock(() => ({ where: srSelectWhere }));
		const srSelect = mock(() => ({ from: srSelectFrom }));
		const srTransaction = mock(async (fn: any) => fn({ insert: txInsert }));

		const db = {
			select: srSelect,
			query: {
				stockRequests: { findMany: mock(() => Promise.resolve([])), findFirst: mock(() => Promise.resolve(null)) },
				stockRequestItems: { findMany: mock(() => Promise.resolve([])), findFirst: mock(() => Promise.resolve(null)) },
			},
			transaction: srTransaction,
		} as any;

		return { db, txValuesHeader };
	}

	test("total=0 → SR number ends in 0001", async () => {
		const { db, txValuesHeader } = buildSrMocks(0, "SR-20260227-0001");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0][0].requestNumber).toMatch(/^SR-\d{8}-0001$/);
	});

	test("total=8 → SR number ends in 0009", async () => {
		const { db, txValuesHeader } = buildSrMocks(8, "SR-20260227-0009");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0][0].requestNumber).toMatch(/^SR-\d{8}-0009$/);
	});

	test("total=9 → SR number ends in 0010", async () => {
		const { db, txValuesHeader } = buildSrMocks(9, "SR-20260227-0010");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0][0].requestNumber).toMatch(/^SR-\d{8}-0010$/);
	});

	test("total=98 → SR number ends in 0099", async () => {
		const { db, txValuesHeader } = buildSrMocks(98, "SR-20260227-0099");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0][0].requestNumber).toMatch(/^SR-\d{8}-0099$/);
	});
});

describe("TO — Transfer Order number generation", () => {
	const makeTransferOrderParams = () => ({
		dateIssued: new Date("2026-02-27"),
		fromBranchId: "br1",
		toBranchId: "br2",
		issuedByMemberId: "member-1",
		items: [] as { productId: string; quantityTransferred: number }[],
	});

	function buildToMocks(total: number, numberValue: string) {
		const fakeHeader = {
			id: "to1",
			transferNumber: numberValue,
			fromBranchId: "br1",
			toBranchId: "br2",
			status: "pending",
		};
		const txReturningHeader = mock(() => Promise.resolve([fakeHeader]));
		const txValuesHeader = mock(() => ({ returning: txReturningHeader }));
		const txReturningItems = mock(() => Promise.resolve([]));
		const txValuesItems = mock(() => ({ returning: txReturningItems }));

		let insertCallCount = 0;
		const txInsert = mock(() => {
			insertCallCount++;
			return insertCallCount === 1 ? { values: txValuesHeader } : { values: txValuesItems };
		});

		const toSelectWhere = mock(() => Promise.resolve([{ total }]));
		const toSelectFrom = mock(() => ({ where: toSelectWhere }));
		const toSelect = mock(() => ({ from: toSelectFrom }));
		const toTransaction = mock(async (fn: any) => fn({ insert: txInsert }));

		const db = {
			select: toSelect,
			query: {
				transferOrders: { findMany: mock(() => Promise.resolve([])), findFirst: mock(() => Promise.resolve(null)) },
				transferOrderItems: { findMany: mock(() => Promise.resolve([])), findFirst: mock(() => Promise.resolve(null)) },
			},
			transaction: toTransaction,
		} as any;

		return { db, txValuesHeader };
	}

	test("total=0 → TO number ends in 0001", async () => {
		const { db, txValuesHeader } = buildToMocks(0, "TO-20260227-0001");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0][0].transferNumber).toMatch(/^TO-\d{8}-0001$/);
	});

	test("total=8 → TO number ends in 0009", async () => {
		const { db, txValuesHeader } = buildToMocks(8, "TO-20260227-0009");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0][0].transferNumber).toMatch(/^TO-\d{8}-0009$/);
	});

	test("total=9 → TO number ends in 0010", async () => {
		const { db, txValuesHeader } = buildToMocks(9, "TO-20260227-0010");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0][0].transferNumber).toMatch(/^TO-\d{8}-0010$/);
	});

	test("total=98 → TO number ends in 0099", async () => {
		const { db, txValuesHeader } = buildToMocks(98, "TO-20260227-0099");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0][0].transferNumber).toMatch(/^TO-\d{8}-0099$/);
	});
});
