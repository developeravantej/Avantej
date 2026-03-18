import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listSuppliers,
	getSupplierById,
	createSupplier,
	updateSupplier,
	deactivateSupplier,
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

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	query: {
		suppliers: {
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
});

describe("listSuppliers", () => {
	test("returns all suppliers when no filters provided", async () => {
		const fakeSuppliers = [
			{ id: "s1", name: "Supplier A", isActive: true },
			{ id: "s2", name: "Supplier B", isActive: false },
		];
		mockFindMany.mockResolvedValueOnce(fakeSuppliers);

		const result = await listSuppliers(mockTenantDb);

		expect(result).toEqual(fakeSuppliers);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		// No where clause when no filters
		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeUndefined();
	});

	test("applies isActive filter when provided", async () => {
		const activeSuppliers = [{ id: "s1", name: "Supplier A", isActive: true }];
		mockFindMany.mockResolvedValueOnce(activeSuppliers);

		const result = await listSuppliers(mockTenantDb, { isActive: true });

		expect(result).toEqual(activeSuppliers);
		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies search filter when provided", async () => {
		mockFindMany.mockResolvedValueOnce([{ id: "s1", name: "Supplier A", isActive: true }]);

		await listSuppliers(mockTenantDb, { search: "Supplier A" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("combines isActive and search filters", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listSuppliers(mockTenantDb, { isActive: true, search: "Supplier" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});
});

describe("getSupplierById", () => {
	test("returns supplier when found", async () => {
		const fakeSupplier = { id: "s1", name: "Supplier A", isActive: true };
		mockFindFirst.mockResolvedValueOnce(fakeSupplier);

		const result = await getSupplierById(mockTenantDb, "s1");

		expect(result).toEqual(fakeSupplier);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when supplier not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getSupplierById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createSupplier", () => {
	test("inserts and returns the new supplier with defaults", async () => {
		const fakeSupplier = {
			id: "s1",
			name: "Supplier A",
			isActive: true,
			description: null,
			accountNumber: null,
		};
		mockReturning.mockResolvedValueOnce([fakeSupplier]);

		const result = await createSupplier(mockTenantDb, { name: "Supplier A" });

		expect(result).toEqual(fakeSupplier);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		expect(mockValues).toHaveBeenCalledTimes(1);
		// Defaults: isActive = true
		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.isActive).toBe(true);
	});

	test("inserts with all optional fields", async () => {
		const fakeSupplier = {
			id: "s2",
			name: "Supplier B",
			isActive: false,
			email: "b@supplier.com",
			contactPerson: "Bob",
		};
		mockReturning.mockResolvedValueOnce([fakeSupplier]);

		const result = await createSupplier(mockTenantDb, {
			name: "Supplier B",
			email: "b@supplier.com",
			contactPerson: "Bob",
			isActive: false,
		});

		expect(result).toEqual(fakeSupplier);
		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.email).toBe("b@supplier.com");
		expect(valuesArg.isActive).toBe(false);
	});

	test("throws 'Failed to create supplier' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(createSupplier(mockTenantDb, { name: "Supplier A" })).rejects.toThrow("Failed to create supplier");
	});
});

describe("updateSupplier", () => {
	test("updates and returns the supplier", async () => {
		const updatedSupplier = { id: "s1", name: "Updated Name", isActive: true };
		const mockReturningUpd = mock(() => Promise.resolve([updatedSupplier]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateSupplier(mockTenantDb, "s1", { name: "Updated Name" });

		expect(result).toEqual(updatedSupplier);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Supplier not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(updateSupplier(mockTenantDb, "nonexistent", { name: "X" })).rejects.toThrow("Supplier not found");
	});
});

describe("deactivateSupplier", () => {
	test("sets isActive=false via update (soft delete)", async () => {
		const deactivatedSupplier = { id: "s1", name: "Supplier A", isActive: false };
		const mockReturningUpd = mock(() => Promise.resolve([deactivatedSupplier]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await deactivateSupplier(mockTenantDb, "s1");

		expect(result).toEqual(deactivatedSupplier);
		expect(result.isActive).toBe(false);
		// Must call update, NOT delete
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		const setArg = mockSetUpd.mock.calls[0][0];
		expect(setArg.isActive).toBe(false);
	});

	test("throws 'Supplier not found' when deactivate returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(deactivateSupplier(mockTenantDb, "nonexistent")).rejects.toThrow("Supplier not found");
	});
});
