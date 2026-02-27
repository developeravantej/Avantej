import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listInvoices,
	getInvoiceById,
	createInvoice,
	updateInvoice,
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

// select chain for count queries: select({total}).from(table).where(...) → [{total: N}]
const mockSelectWhere = mock(() => Promise.resolve([{ total: 0 }]));
const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
const mockSelect = mock(() => ({ from: mockSelectFrom }));

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	select: mockSelect,
	query: {
		invoices: {
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

describe("listInvoices", () => {
	test("returns all invoices with no filters", async () => {
		const fakeInvoices = [
			{ id: "inv1", invoiceNumber: "INV-20260227-0001", status: "draft" },
		];
		mockFindMany.mockResolvedValueOnce(fakeInvoices);

		const result = await listInvoices(mockTenantDb);

		expect(result).toEqual(fakeInvoices);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeUndefined();
	});

	test("applies status filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listInvoices(mockTenantDb, { status: "paid" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies customerId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listInvoices(mockTenantDb, { customerId: "cust-1" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies date range filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		const from = new Date("2026-01-01");
		const to = new Date("2026-01-31");
		await listInvoices(mockTenantDb, { from, to });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies salesOrderId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listInvoices(mockTenantDb, { salesOrderId: "so1" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("combines multiple filters", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listInvoices(mockTenantDb, {
			status: "overdue",
			salesOrderId: "so1",
			from: new Date("2026-01-01"),
		});

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});
});

describe("getInvoiceById", () => {
	test("returns invoice when found", async () => {
		const fakeInvoice = { id: "inv1", invoiceNumber: "INV-20260227-0001" };
		mockFindFirst.mockResolvedValueOnce(fakeInvoice);

		const result = await getInvoiceById(mockTenantDb, "inv1");

		expect(result).toEqual(fakeInvoice);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when invoice not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getInvoiceById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createInvoice", () => {
	test("auto-generates invoice number when invoiceNumber not provided (total=0 → 0001)", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);

		const fakeInvoice = {
			id: "inv1",
			invoiceNumber: "INV-20260227-0001",
			customerName: "Alice",
			status: "draft",
		};
		mockReturning.mockResolvedValueOnce([fakeInvoice]);

		const result = await createInvoice(mockTenantDb, {
			date: new Date("2026-02-27"),
			customerName: "Alice",
			createdBy: "user-1",
			totalAmount: 100,
			status: "draft",
		});

		expect(result).toEqual(fakeInvoice);
		// select was called to generate the number
		expect(mockSelect).toHaveBeenCalledTimes(1);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.invoiceNumber).toMatch(/INV-\d{8}-0001/);
	});

	test("skips number generation when invoiceNumber is explicitly provided", async () => {
		const fakeInvoice = {
			id: "inv2",
			invoiceNumber: "INV-CUSTOM-001",
			customerName: "Bob",
			status: "sent",
		};
		mockReturning.mockResolvedValueOnce([fakeInvoice]);

		const result = await createInvoice(mockTenantDb, {
			invoiceNumber: "INV-CUSTOM-001",
			date: new Date("2026-02-27"),
			customerName: "Bob",
			createdBy: "user-1",
			totalAmount: 200,
			status: "sent",
		});

		expect(result).toEqual(fakeInvoice);
		// select should NOT be called when invoiceNumber is provided
		expect(mockSelect).not.toHaveBeenCalled();
		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.invoiceNumber).toBe("INV-CUSTOM-001");
	});

	test("uses amountPaid=0 when not provided", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);
		const fakeInvoice = { id: "inv3", invoiceNumber: "INV-20260227-0001" };
		mockReturning.mockResolvedValueOnce([fakeInvoice]);

		await createInvoice(mockTenantDb, {
			date: new Date("2026-02-27"),
			customerName: "Carol",
			createdBy: "user-1",
			totalAmount: 150,
			status: "draft",
		});

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.amountPaid).toBe(0);
	});

	test("throws 'Failed to create invoice' when insert returns empty", async () => {
		mockSelectWhere.mockResolvedValueOnce([{ total: 0 }]);
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			createInvoice(mockTenantDb, {
				date: new Date("2026-02-27"),
				customerName: "Alice",
				createdBy: "user-1",
				totalAmount: 100,
				status: "draft",
			})
		).rejects.toThrow("Failed to create invoice");
	});
});

describe("updateInvoice", () => {
	test("updates and returns the invoice", async () => {
		const updatedInvoice = { id: "inv1", invoiceNumber: "INV-20260227-0001", status: "paid" };
		const mockReturningUpd = mock(() => Promise.resolve([updatedInvoice]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateInvoice(mockTenantDb, "inv1", { status: "paid", amountPaid: 100 });

		expect(result).toEqual(updatedInvoice);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Invoice not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(updateInvoice(mockTenantDb, "nonexistent", { status: "paid" })).rejects.toThrow("Invoice not found");
	});
});
