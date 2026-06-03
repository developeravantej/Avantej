/**
 * Sequence Number Generation Tests
 *
 * Tests the document number generation helpers indirectly via public create functions.
 *
 * Document types and their generation strategies:
 *  - SO   (Sales Orders)       → count(LIKE prefix) + 1, 4-digit padding
 *  - CAN  (Cancelled Sales)    → count(LIKE prefix) + 1, 4-digit padding (via cancelSalesOrder)
 *  - INV  (Invoices)           → nextval('tenant_invoice_seq'), 6-digit padding
 *  - SR   (Stock Requests)     → count(LIKE prefix) + 1, 4-digit padding
 *  - TO   (Transfer Orders)    → count(LIKE prefix) + 1, 4-digit padding
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
const mockFindMany = mock(
	(..._args: any[]): Promise<any[]> => Promise.resolve([]),
);
const mockFindFirst = mock(
	(..._args: any[]): Promise<any> => Promise.resolve(null),
);
const mockReturning = mock(
	(..._args: any[]): Promise<any[]> => Promise.resolve([]),
);
const mockValues = mock((..._args: any[]) => ({ returning: mockReturning }));
const mockInsert = mock((..._args: any[]) => ({ values: mockValues }));
const mockUpdate = mock((..._args: any[]) => ({
	set: mock((..._args: any[]) => ({
		where: mock((..._args: any[]) => ({ returning: mockReturning })),
	})),
}));

// select().from().where() → [{total: N}]
const mockSelectWhere = mock(
	(..._args: any[]): Promise<any[]> => Promise.resolve([{ total: 0 }]),
);
const mockSelectFrom = mock((..._args: any[]) => ({ where: mockSelectWhere }));
const mockSelect = mock((..._args: any[]) => ({ from: mockSelectFrom }));

// execute mock for raw SQL: tenantDb.execute(sql`SELECT nextval(...)`) → { rows: [{ seq }] }
const mockExecute = mock(
	(..._args: any[]): Promise<any> => Promise.resolve({ rows: [{ seq: "1" }] }),
);

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
	execute: mockExecute,
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
	mockExecute.mockClear();
	mockTransaction.mockClear();
});

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

	// SO numbers come from nextval('tenant_sales_order_seq') and are formatted
	// as SO-NNNNNN (6-digit zero-padded sequence, no date segment). The seq value
	// is read via tenantDb.execute(sql`SELECT nextval(...) AS seq`) → { rows: [{ seq }] }.

	test("seq=1 → SO number ends in 000001", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "1" }] });
		setupInsertReturning("salesOrderNumber", "SO-000001");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.salesOrderNumber).toMatch(/^SO-000001$/);
	});

	test("seq=9 → SO number ends in 000009", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "9" }] });
		setupInsertReturning("salesOrderNumber", "SO-000009");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.salesOrderNumber).toMatch(/^SO-000009$/);
	});

	test("seq=10 → SO number ends in 000010", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "10" }] });
		setupInsertReturning("salesOrderNumber", "SO-000010");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.salesOrderNumber).toMatch(/^SO-000010$/);
	});

	test("seq=99 → SO number ends in 000099", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "99" }] });
		setupInsertReturning("salesOrderNumber", "SO-000099");

		await createSalesOrder(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.salesOrderNumber).toMatch(/^SO-000099$/);
	});

	test("number is prefixed SO- with 6-digit zero-padded sequence", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "1" }] });
		setupInsertReturning("salesOrderNumber", "SO-000001");

		await createSalesOrder(mockTenantDb, {
			...baseParams,
			date: new Date("2026-02-27"),
		});

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.salesOrderNumber).toMatch(/^SO-\d{6}$/);
	});
});

describe("CAN — Cancellation number generation (via cancelSalesOrder)", () => {
	function buildCanMocks(seq: number, mockOrder: any) {
		const capturedSetArgs: any[] = [];
		const cancelledOrder = { ...mockOrder, status: "cancelled" };

		const canFindFirst = mock((..._args: any[]) => Promise.resolve(mockOrder));
		// CAN numbers are CAN-YYYYMMDD-NNNN where NNNN comes from
		// nextval('tenant_cancellation_seq') via tenantDb.execute(...) → { rows: [{ seq }] }.
		const canExecute = mock((..._args: any[]) =>
			Promise.resolve({ rows: [{ seq: String(seq) }] }),
		);
		const canSelectWhere = mock((..._args: any[]) => Promise.resolve([]));
		const canSelectFrom = mock((..._args: any[]) => ({
			where: canSelectWhere,
		}));
		const canSelect = mock((..._args: any[]) => ({ from: canSelectFrom }));
		const canReturning = mock((..._args: any[]) =>
			Promise.resolve([cancelledOrder]),
		);
		const canUpdate = mock((..._args: any[]) => ({
			set: mock((setArg: any) => {
				capturedSetArgs.push(setArg);
				Object.assign(cancelledOrder, setArg);
				return {
					where: mock((..._args: any[]) => ({ returning: canReturning })),
				};
			}),
		}));
		// Insert mock for tx.insert(auditLogs).values(...) in writeAudit
		const canInsert = mock((..._args: any[]) => ({
			values: mock((..._args: any[]) => Promise.resolve([])),
		}));

		// tx passed into transaction callback — needs update/insert/select
		// for: update salesOrders, writeAudit insert, voidCommissionSplitsForSalesOrder select
		const tx: any = {
			update: canUpdate,
			insert: canInsert,
			select: canSelect,
		};
		// voidCommissionSplitsForSalesOrder opens its own nested transaction on the
		// tx handed to it; the inner select returns [] so no splits are voided.
		tx.transaction = mock(async (fn: any) => fn(tx));
		const canTransaction = mock(async (fn: any) => fn(tx));

		const db = {
			insert: canInsert,
			update: canUpdate,
			select: canSelect,
			execute: canExecute,
			query: {
				salesOrders: {
					findMany: mock((..._args: any[]) => Promise.resolve([])),
					findFirst: canFindFirst,
				},
			},
			transaction: canTransaction,
		} as any;

		return { db, capturedSetArgs };
	}

	const actor = { userId: "u1", memberId: "m1", role: "admin" };

	test("seq=1 → CAN number ends in 0001", async () => {
		const mockOrder = {
			id: "so1",
			salesOrderNumber: "SO-20260227-0001",
			branchId: "br1",
			customerName: "Alice",
			customerId: null,
			totalAmount: 500,
		};
		const { db, capturedSetArgs } = buildCanMocks(1, mockOrder);

		await cancelSalesOrder(
			db,
			"so1",
			{ cancelledBy: "user-1", refundAmount: 100 },
			actor,
		);

		expect(capturedSetArgs[0].cancellationNumber).toMatch(/^CAN-\d{8}-0001$/);
	});

	test("seq=10 → CAN number ends in 0010", async () => {
		const mockOrder = {
			id: "so1",
			salesOrderNumber: "SO-20260227-0001",
			branchId: "br1",
			customerName: "Alice",
			customerId: null,
			totalAmount: 500,
		};
		const { db, capturedSetArgs } = buildCanMocks(10, mockOrder);

		await cancelSalesOrder(
			db,
			"so1",
			{ cancelledBy: "user-1", refundAmount: 50 },
			actor,
		);

		expect(capturedSetArgs[0].cancellationNumber).toMatch(/^CAN-\d{8}-0010$/);
	});
});

describe("INV — Invoice number generation (nextval-based, 6-digit padding)", () => {
	const baseParams = {
		date: new Date("2026-02-27"),
		customerName: "Test Customer",
		createdBy: "user-1",
		totalAmount: 100,
		status: "draft" as const,
	};

	test("seq=1 → INV number ends in 000001", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "1" }] });
		setupInsertReturning("invoiceNumber", "INV-20260227-000001");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-000001$/);
	});

	test("seq=9 → INV number ends in 000009", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "9" }] });
		setupInsertReturning("invoiceNumber", "INV-20260227-000009");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-000009$/);
	});

	test("seq=10 → INV number ends in 000010", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "10" }] });
		setupInsertReturning("invoiceNumber", "INV-20260227-000010");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-000010$/);
	});

	test("seq=99 → INV number ends in 000099", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "99" }] });
		setupInsertReturning("invoiceNumber", "INV-20260227-000099");

		await createInvoice(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-\d{8}-000099$/);
	});

	test("date portion is embedded correctly (YYYYMMDD)", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ seq: "1" }] });
		setupInsertReturning("invoiceNumber", "INV-20260227-000001");

		await createInvoice(mockTenantDb, {
			...baseParams,
			date: new Date("2026-02-27"),
		});

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.invoiceNumber).toMatch(/^INV-20260227-/);
	});

	test("does NOT call execute when invoiceNumber is explicitly provided", async () => {
		setupInsertReturning("invoiceNumber", "INV-MANUAL-001");

		await createInvoice(mockTenantDb, {
			...baseParams,
			invoiceNumber: "INV-MANUAL-001",
		});

		expect(mockExecute).not.toHaveBeenCalled();
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
		const fakeHeader = {
			id: "sr1",
			requestNumber: numberValue,
			toBranchId: "br1",
			status: "pending",
		};
		const txReturningHeader = mock((..._args: any[]) =>
			Promise.resolve([fakeHeader]),
		);
		const txValuesHeader = mock((..._args: any[]) => ({
			returning: txReturningHeader,
		}));
		const txReturningItems = mock((..._args: any[]) => Promise.resolve([]));
		const txValuesItems = mock((..._args: any[]) => ({
			returning: txReturningItems,
		}));

		let insertCallCount = 0;
		const txInsert = mock((..._args: any[]) => {
			insertCallCount++;
			return insertCallCount === 1
				? { values: txValuesHeader }
				: { values: txValuesItems };
		});

		const srSelectWhere = mock((..._args: any[]) =>
			Promise.resolve([{ total }]),
		);
		const srSelectFrom = mock((..._args: any[]) => ({ where: srSelectWhere }));
		const srSelect = mock((..._args: any[]) => ({ from: srSelectFrom }));
		const srTransaction = mock(async (fn: any) => fn({ insert: txInsert }));

		const db = {
			select: srSelect,
			query: {
				stockRequests: {
					findMany: mock((..._args: any[]) => Promise.resolve([])),
					findFirst: mock((..._args: any[]) => Promise.resolve(null)),
				},
				stockRequestItems: {
					findMany: mock((..._args: any[]) => Promise.resolve([])),
					findFirst: mock((..._args: any[]) => Promise.resolve(null)),
				},
			},
			transaction: srTransaction,
		} as any;

		return { db, txValuesHeader };
	}

	test("total=0 → SR number ends in 0001", async () => {
		const { db, txValuesHeader } = buildSrMocks(0, "SR-20260227-0001");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0]![0].requestNumber).toMatch(
			/^SR-\d{8}-0001$/,
		);
	});

	test("total=8 → SR number ends in 0009", async () => {
		const { db, txValuesHeader } = buildSrMocks(8, "SR-20260227-0009");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0]![0].requestNumber).toMatch(
			/^SR-\d{8}-0009$/,
		);
	});

	test("total=9 → SR number ends in 0010", async () => {
		const { db, txValuesHeader } = buildSrMocks(9, "SR-20260227-0010");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0]![0].requestNumber).toMatch(
			/^SR-\d{8}-0010$/,
		);
	});

	test("total=98 → SR number ends in 0099", async () => {
		const { db, txValuesHeader } = buildSrMocks(98, "SR-20260227-0099");
		await createStockRequest(db, makeStockRequestParams());
		expect(txValuesHeader.mock.calls[0]![0].requestNumber).toMatch(
			/^SR-\d{8}-0099$/,
		);
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
		const txReturningHeader = mock((..._args: any[]) =>
			Promise.resolve([fakeHeader]),
		);
		const txValuesHeader = mock((..._args: any[]) => ({
			returning: txReturningHeader,
		}));
		const txReturningItems = mock((..._args: any[]) => Promise.resolve([]));
		const txValuesItems = mock((..._args: any[]) => ({
			returning: txReturningItems,
		}));

		let insertCallCount = 0;
		const txInsert = mock((..._args: any[]) => {
			insertCallCount++;
			return insertCallCount === 1
				? { values: txValuesHeader }
				: { values: txValuesItems };
		});

		const toSelectWhere = mock((..._args: any[]) =>
			Promise.resolve([{ total }]),
		);
		const toSelectFrom = mock((..._args: any[]) => ({ where: toSelectWhere }));
		const toSelect = mock((..._args: any[]) => ({ from: toSelectFrom }));
		const toTransaction = mock(async (fn: any) => fn({ insert: txInsert }));

		const db = {
			select: toSelect,
			query: {
				transferOrders: {
					findMany: mock((..._args: any[]) => Promise.resolve([])),
					findFirst: mock((..._args: any[]) => Promise.resolve(null)),
				},
				transferOrderItems: {
					findMany: mock((..._args: any[]) => Promise.resolve([])),
					findFirst: mock((..._args: any[]) => Promise.resolve(null)),
				},
			},
			transaction: toTransaction,
		} as any;

		return { db, txValuesHeader };
	}

	test("total=0 → TO number ends in 0001", async () => {
		const { db, txValuesHeader } = buildToMocks(0, "TO-20260227-0001");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0]![0].transferNumber).toMatch(
			/^TO-\d{8}-0001$/,
		);
	});

	test("total=8 → TO number ends in 0009", async () => {
		const { db, txValuesHeader } = buildToMocks(8, "TO-20260227-0009");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0]![0].transferNumber).toMatch(
			/^TO-\d{8}-0009$/,
		);
	});

	test("total=9 → TO number ends in 0010", async () => {
		const { db, txValuesHeader } = buildToMocks(9, "TO-20260227-0010");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0]![0].transferNumber).toMatch(
			/^TO-\d{8}-0010$/,
		);
	});

	test("total=98 → TO number ends in 0099", async () => {
		const { db, txValuesHeader } = buildToMocks(98, "TO-20260227-0099");
		await createTransferOrder(db, makeTransferOrderParams());
		expect(txValuesHeader.mock.calls[0]![0].transferNumber).toMatch(
			/^TO-\d{8}-0099$/,
		);
	});
});
