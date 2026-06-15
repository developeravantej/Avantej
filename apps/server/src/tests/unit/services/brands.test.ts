import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listBrands,
	getBrandById,
	createBrand,
	updateBrand,
	deleteBrand,
} from "@avantej-core/services";

// --- Mock chain builders ---
const mockFindMany = mock((): Promise<any> => Promise.resolve([]));
const mockFindFirst = mock((): Promise<any> => Promise.resolve(null));
const mockReturning = mock((): Promise<any[]> => Promise.resolve([]));
const mockValues = mock(() => ({ returning: mockReturning }));
const mockInsert = mock(() => ({ values: mockValues }));
const mockWhere = mock(() => Promise.resolve());
const mockDelete = mock(() => ({ where: mockWhere }));

// update chain: update().set().where().returning()
const mockUpdateWhereReturning = mock(() => ({ returning: mockReturning }));
const mockUpdateWhere = mock(() => ({ returning: mockUpdateWhereReturning() }));
const mockSet = mock(() => ({ where: mockUpdateWhere }));
const mockUpdate = mock((): any => ({ set: mockSet }));

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	delete: mockDelete,
	query: {
		brands: {
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
	mockSet.mockClear();
	mockUpdate.mockClear();
	mockUpdateWhere.mockClear();
	mockUpdateWhereReturning.mockClear();
});

describe("listBrands", () => {
	test("returns all brands with no search", async () => {
		const fakeBrands = [
			{ id: "b1", name: "Nike" },
			{ id: "b2", name: "Adidas" },
		];
		mockFindMany.mockResolvedValueOnce(fakeBrands);

		const result = await listBrands(mockTenantDb);

		expect(result as any).toEqual(fakeBrands);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
	});

	test("calls findMany with search param when search is provided", async () => {
		mockFindMany.mockResolvedValueOnce([{ id: "b1", name: "Nike" }]);

		const result = await listBrands(mockTenantDb, { search: "Nike" });

		expect(result).toHaveLength(1);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		// The call should have a where clause (ilike) - we just verify it's called
		const callArg = ((mockFindMany as any).mock.calls[0] ?? [])[0]!;
		expect(callArg).toHaveProperty("where");
	});

	test("returns empty array when no brands exist", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		const result = await listBrands(mockTenantDb);

		expect(result).toEqual([]);
	});
});

describe("getBrandById", () => {
	test("returns brand when found", async () => {
		const fakeBrand = { id: "b1", name: "Nike" };
		mockFindFirst.mockResolvedValueOnce(fakeBrand);

		const result = await getBrandById(mockTenantDb, "b1");

		expect(result as any).toEqual(fakeBrand);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when brand not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getBrandById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createBrand", () => {
	test("inserts and returns the new brand", async () => {
		const fakeBrand = { id: "b1", name: "Nike", description: null };
		mockReturning.mockResolvedValueOnce([fakeBrand]);

		const result = await createBrand(mockTenantDb, { name: "Nike" });

		expect(result as any).toEqual(fakeBrand);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		expect(mockValues).toHaveBeenCalledTimes(1);
		expect(mockReturning).toHaveBeenCalledTimes(1);
	});

	test("inserts with description when provided", async () => {
		const fakeBrand = { id: "b2", name: "Adidas", description: "Sportswear" };
		mockReturning.mockResolvedValueOnce([fakeBrand]);

		const result = await createBrand(mockTenantDb, {
			name: "Adidas",
			description: "Sportswear",
		});

		expect(result as any).toEqual(fakeBrand);
		const valuesArg = ((mockValues as any).mock.calls[0] ?? [])[0]! as any;
		expect(valuesArg.description).toBe("Sportswear");
	});

	test("throws 'Failed to create brand' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(createBrand(mockTenantDb, { name: "Nike" })).rejects.toThrow(
			"Failed to create brand",
		);
	});
});

describe("updateBrand", () => {
	test("updates and returns the brand", async () => {
		const updatedBrand = { id: "b1", name: "Nike Updated", description: null };

		// update().set() returns { where: fn }; where() returns { returning: fn }; returning() returns rows
		const mockReturningUpd = mock(() => Promise.resolve([updatedBrand]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateBrand(mockTenantDb, "b1", {
			name: "Nike Updated",
		});

		expect(result as any).toEqual(updatedBrand);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Brand not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(
			updateBrand(mockTenantDb, "nonexistent", { name: "X" }),
		).rejects.toThrow("Brand not found");
	});
});

describe("deleteBrand", () => {
	test("calls delete with the correct id", async () => {
		await deleteBrand(mockTenantDb, "b1");

		expect(mockDelete).toHaveBeenCalledTimes(1);
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});
});
