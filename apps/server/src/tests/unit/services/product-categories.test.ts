import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listProductCategories,
	getProductCategoryById,
	createProductCategory,
	updateProductCategory,
	deleteProductCategory,
} from "@avantej-core/services";

const mockFindMany = mock((): Promise<any> => Promise.resolve([]));
const mockFindFirst = mock((): Promise<any> => Promise.resolve(null));
const mockReturning = mock((): Promise<any[]> => Promise.resolve([]));
const mockValues = mock(() => ({ returning: mockReturning }));
const mockInsert = mock(() => ({ values: mockValues }));
const mockWhere = mock(() => Promise.resolve());
const mockDelete = mock(() => ({ where: mockWhere }));
const mockUpdate = mock((): any => ({
	set: mock(() => ({
		where: mock(() => ({ returning: mockReturning })),
	})),
}));

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	delete: mockDelete,
	query: {
		productCategories: {
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

describe("listProductCategories", () => {
	test("returns all categories with no filter", async () => {
		const fakeCategories = [
			{ id: "c1", name: "Apparel" },
			{ id: "c2", name: "Footwear" },
		];
		mockFindMany.mockResolvedValueOnce(fakeCategories);

		const result = await listProductCategories(mockTenantDb);

		expect(result as any).toEqual(fakeCategories);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
	});

	test("passes where clause when search is provided", async () => {
		mockFindMany.mockResolvedValueOnce([{ id: "c1", name: "Apparel" }]);

		const result = await listProductCategories(mockTenantDb, { search: "App" });

		expect(result).toHaveLength(1);
		const callArg = ((mockFindMany as any).mock.calls[0] ?? [])[0]!;
		expect(callArg).toHaveProperty("where");
	});

	test("returns empty array when no categories exist", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		const result = await listProductCategories(mockTenantDb);

		expect(result).toEqual([]);
	});
});

describe("getProductCategoryById", () => {
	test("returns category when found", async () => {
		const fakeCategory = { id: "c1", name: "Apparel" };
		mockFindFirst.mockResolvedValueOnce(fakeCategory);

		const result = await getProductCategoryById(mockTenantDb, "c1");

		expect(result as any).toEqual(fakeCategory);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when category not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getProductCategoryById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createProductCategory", () => {
	test("inserts and returns the new category", async () => {
		const fakeCategory = { id: "c1", name: "Apparel", externalCode: null, description: null };
		mockReturning.mockResolvedValueOnce([fakeCategory]);

		const result = await createProductCategory(mockTenantDb, { name: "Apparel" });

		expect(result as any).toEqual(fakeCategory);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		expect(mockValues).toHaveBeenCalledTimes(1);
	});

	test("inserts with externalCode and description when provided", async () => {
		const fakeCategory = { id: "c2", name: "Footwear", externalCode: "FW-01", description: "All footwear" };
		mockReturning.mockResolvedValueOnce([fakeCategory]);

		const result = await createProductCategory(mockTenantDb, {
			name: "Footwear",
			externalCode: "FW-01",
			description: "All footwear",
		});

		expect(result as any).toEqual(fakeCategory);
		const valuesArg = ((mockValues as any).mock.calls[0] ?? [])[0]! as any;
		expect(valuesArg.externalCode).toBe("FW-01");
		expect(valuesArg.description).toBe("All footwear");
	});

	test("throws 'Failed to create product category' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			createProductCategory(mockTenantDb, { name: "Apparel" })
		).rejects.toThrow("Failed to create product category");
	});
});

describe("updateProductCategory", () => {
	test("updates and returns the category", async () => {
		const updatedCategory = { id: "c1", name: "Updated Apparel", externalCode: null, description: null };
		const mockReturningUpd = mock(() => Promise.resolve([updatedCategory]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateProductCategory(mockTenantDb, "c1", { name: "Updated Apparel" });

		expect(result as any).toEqual(updatedCategory);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Product category not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(
			updateProductCategory(mockTenantDb, "nonexistent", { name: "X" })
		).rejects.toThrow("Product category not found");
	});
});

describe("deleteProductCategory", () => {
	test("calls delete with the correct id", async () => {
		await deleteProductCategory(mockTenantDb, "c1");

		expect(mockDelete).toHaveBeenCalledTimes(1);
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});
});
