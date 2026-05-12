import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listUnitsOfMeasure,
	getUomById,
	createUom,
	updateUom,
	deleteUom,
} from "@avantej-core/services";

const mockFindMany = mock((..._args: any[]) => Promise.resolve([] as any[]));
const mockFindFirst = mock((..._args: any[]) => Promise.resolve(null as any));
const mockReturning = mock(() => Promise.resolve([] as any[]));
const mockValues = mock((..._args: any[]) => ({ returning: mockReturning }));
const mockInsert = mock(() => ({ values: mockValues }));
const mockWhere = mock(() => Promise.resolve());
const mockDelete = mock(() => ({ where: mockWhere }));
const mockUpdate = mock(() => ({
	set: mock((..._args: any[]) => ({
		where: mock(() => ({ returning: mockReturning })),
	})),
}));

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	delete: mockDelete,
	query: {
		unitsOfMeasure: {
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
	mockWhere.mockClear();
	mockDelete.mockClear();
	mockUpdate.mockClear();
});

describe("listUnitsOfMeasure", () => {
	test("returns all UOMs when no search filter", async () => {
		const fakeUoms = [
			{ id: "u1", name: "Kilogram" },
			{ id: "u2", name: "Litre" },
		];
		mockFindMany.mockResolvedValueOnce(fakeUoms);

		const result = await listUnitsOfMeasure(mockTenantDb);

		expect(result).toEqual(fakeUoms as any);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		// No where clause
		const callArg = mockFindMany.mock.calls[0]![0]!;
		expect(callArg.where).toBeUndefined();
	});

	test("passes where clause when search is provided", async () => {
		mockFindMany.mockResolvedValueOnce([{ id: "u1", name: "Kilogram" }]);

		await listUnitsOfMeasure(mockTenantDb, { search: "Kilo" });

		const callArg = mockFindMany.mock.calls[0]![0]!;
		expect(callArg.where).toBeDefined();
	});

	test("returns empty array when no UOMs exist", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		const result = await listUnitsOfMeasure(mockTenantDb);

		expect(result).toEqual([]);
	});
});

describe("getUomById", () => {
	test("returns UOM when found", async () => {
		const fakeUom = { id: "u1", name: "Kilogram" };
		mockFindFirst.mockResolvedValueOnce(fakeUom);

		const result = await getUomById(mockTenantDb, "u1");

		expect(result).toEqual(fakeUom as any);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when UOM not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getUomById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createUom", () => {
	test("inserts and returns the new UOM with defaults", async () => {
		const fakeUom = { id: "u1", name: "Kilogram", baseUomId: null, conversionFactor: "1" };
		mockReturning.mockResolvedValueOnce([fakeUom]);

		const result = await createUom(mockTenantDb, { name: "Kilogram" });

		expect(result).toEqual(fakeUom as any);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		const valuesArg = mockValues.mock.calls[0]![0]!;
		expect(valuesArg.conversionFactor).toBe("1");
		expect(valuesArg.baseUomId).toBeNull();
	});

	test("inserts with baseUomId and conversionFactor when provided", async () => {
		const fakeUom = { id: "u2", name: "Gram", baseUomId: "u1", conversionFactor: "0.001" };
		mockReturning.mockResolvedValueOnce([fakeUom]);

		const result = await createUom(mockTenantDb, {
			name: "Gram",
			baseUomId: "u1",
			conversionFactor: "0.001",
		});

		expect(result).toEqual(fakeUom as any);
		const valuesArg = mockValues.mock.calls[0]![0]!;
		expect(valuesArg.baseUomId).toBe("u1");
		expect(valuesArg.conversionFactor).toBe("0.001");
	});

	test("throws 'Failed to create unit of measure' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(createUom(mockTenantDb, { name: "Kilogram" })).rejects.toThrow(
			"Failed to create unit of measure"
		);
	});
});

describe("updateUom", () => {
	test("updates and returns the UOM", async () => {
		const updatedUom = { id: "u1", name: "Updated Kilogram", conversionFactor: "1" };
		const mockReturningUpd = mock(() => Promise.resolve([updatedUom]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateUom(mockTenantDb, "u1", { name: "Updated Kilogram" });

		expect(result).toEqual(updatedUom as any);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Unit of measure not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(updateUom(mockTenantDb, "nonexistent", { name: "X" })).rejects.toThrow(
			"Unit of measure not found"
		);
	});
});

describe("deleteUom", () => {
	test("calls delete with the correct id", async () => {
		await deleteUom(mockTenantDb, "u1");

		expect(mockDelete).toHaveBeenCalledTimes(1);
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});
});
