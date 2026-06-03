import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listProducts,
	getProductById,
	createProduct,
	updateProduct,
	getProductStock,
	upsertProductStock,
	adjustStock,
} from "@avantej-core/services";

const mockFindMany = mock<(...args: any[]) => Promise<any>>(() =>
	Promise.resolve([]),
);
const mockFindFirst = mock<(...args: any[]) => Promise<any>>(() =>
	Promise.resolve(null),
);
const mockReturning = mock<(...args: any[]) => Promise<any>>(() =>
	Promise.resolve([]),
);
const mockValues = mock<(...args: any[]) => any>(() => ({
	returning: mockReturning,
}));
const mockOnConflictDoUpdate = mock<(...args: any[]) => any>(() => ({
	returning: mockReturning,
}));
const mockInsertValues = mock<(...args: any[]) => any>(() => ({
	returning: mockReturning,
	onConflictDoUpdate: mockOnConflictDoUpdate,
}));
const mockInsert = mock<(...args: any[]) => any>(() => ({
	values: mockInsertValues,
}));
const mockUpdate = mock<(...args: any[]) => any>(() => ({
	set: mock(() => ({
		where: mock(() => ({ returning: mockReturning })),
	})),
}));

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	query: {
		products: {
			findMany: mockFindMany,
			findFirst: mockFindFirst,
		},
		productStock: {
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
	mockInsertValues.mockClear();
	mockOnConflictDoUpdate.mockClear();
	mockInsert.mockClear();
	mockUpdate.mockClear();
});

describe("listProducts", () => {
	test("returns all products with no filters", async () => {
		const fakeProducts = [
			{ id: "p1", name: "Protein Shake", sku: "PS-001" },
			{ id: "p2", name: "Yoga Mat", sku: "YM-001" },
		];
		mockFindMany.mockResolvedValueOnce(fakeProducts);

		const result = await listProducts(mockTenantDb);

		expect(result as any).toEqual(fakeProducts);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeUndefined();
	});

	test("applies brandId filter", async () => {
		mockFindMany.mockResolvedValueOnce([
			{ id: "p1", name: "Protein Shake", brandId: "b1" },
		]);

		await listProducts(mockTenantDb, { brandId: "b1" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies categoryId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listProducts(mockTenantDb, { categoryId: "cat1" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies supplierId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listProducts(mockTenantDb, { supplierId: "sup1" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies status filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listProducts(mockTenantDb, { status: "active" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies search filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listProducts(mockTenantDb, { search: "Protein" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("combines multiple filters", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listProducts(mockTenantDb, {
			brandId: "b1",
			status: "active",
			search: "Shake",
		});

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});
});

describe("getProductById", () => {
	test("returns product when found", async () => {
		const fakeProduct = { id: "p1", name: "Protein Shake", sku: "PS-001" };
		mockFindFirst.mockResolvedValueOnce(fakeProduct);

		const result = await getProductById(mockTenantDb, "p1");

		expect(result as any).toEqual(fakeProduct);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when product not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getProductById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createProduct", () => {
	test("inserts and returns the new product with defaults", async () => {
		const fakeProduct = {
			id: "p1",
			sku: "PS-001",
			name: "Protein Shake",
			type: "product",
			status: "active",
			price: 50,
			uomId: "u1",
			conversionFactor: "1",
		};
		mockReturning.mockResolvedValueOnce([fakeProduct]);

		const result = await createProduct(mockTenantDb, {
			sku: "PS-001",
			name: "Protein Shake",
			price: 50,
			uomId: "u1",
		});

		expect(result as any).toEqual(fakeProduct);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		const valuesArg = mockInsertValues.mock.calls[0]![0];
		expect(valuesArg.type).toBe("product");
		expect(valuesArg.status).toBe("active");
		expect(valuesArg.conversionFactor).toBe("1");
	});

	test("inserts with optional fields when provided", async () => {
		const fakeProduct = {
			id: "p2",
			sku: "YM-001",
			name: "Yoga Mat",
			type: "product",
			brandId: "b1",
			categoryId: "cat1",
			supplierId: "sup1",
			status: "inactive",
		};
		mockReturning.mockResolvedValueOnce([fakeProduct]);

		await createProduct(mockTenantDb, {
			sku: "YM-001",
			name: "Yoga Mat",
			price: 30,
			uomId: "u1",
			brandId: "b1",
			categoryId: "cat1",
			supplierId: "sup1",
			status: "inactive",
		});

		const valuesArg = mockInsertValues.mock.calls[0]![0];
		expect(valuesArg.brandId).toBe("b1");
		expect(valuesArg.status).toBe("inactive");
	});

	test("throws 'Failed to create product' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			createProduct(mockTenantDb, {
				sku: "PS-001",
				name: "Protein Shake",
				price: 50,
				uomId: "u1",
			}),
		).rejects.toThrow("Failed to create product");
	});
});

describe("updateProduct", () => {
	test("updates and returns the product", async () => {
		const updatedProduct = {
			id: "p1",
			name: "Updated Protein Shake",
			sku: "PS-001",
		};
		const mockReturningUpd = mock(() => Promise.resolve([updatedProduct]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateProduct(mockTenantDb, "p1", {
			name: "Updated Protein Shake",
		});

		expect(result as any).toEqual(updatedProduct);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Product not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(
			updateProduct(mockTenantDb, "nonexistent", { name: "X" }),
		).rejects.toThrow("Product not found");
	});
});

describe("getProductStock", () => {
	test("returns stock record when found", async () => {
		const fakeStock = {
			id: "ps1",
			productId: "p1",
			branchId: "br1",
			quantity: 10,
		};
		mockFindFirst.mockResolvedValueOnce(fakeStock);

		const result = await getProductStock(mockTenantDb, "p1", "br1");

		expect(result as any).toEqual(fakeStock);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when no stock record exists", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getProductStock(mockTenantDb, "p1", "br1");

		expect(result).toBeNull();
	});
});

describe("upsertProductStock", () => {
	test("calls insert with onConflictDoUpdate and returns the row", async () => {
		const fakeStock = {
			id: "ps1",
			productId: "p1",
			branchId: "br1",
			quantity: 20,
		};
		mockReturning.mockResolvedValueOnce([fakeStock]);

		const result = await upsertProductStock(mockTenantDb, "p1", "br1", 20);

		expect(result as any).toEqual(fakeStock);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Failed to upsert product stock' when returning is empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			upsertProductStock(mockTenantDb, "p1", "br1", 20),
		).rejects.toThrow("Failed to upsert product stock");
	});
});

describe("adjustStock", () => {
	test("returns updated row when existing stock record is found (positive delta)", async () => {
		const updatedStock = {
			id: "ps1",
			productId: "p1",
			branchId: "br1",
			quantity: 110,
		};
		// adjustStock calls update().set().where().returning()
		const mockReturningUpd = mock(() => Promise.resolve([updatedStock]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await adjustStock(mockTenantDb, "p1", "br1", 10);

		expect(result as any).toEqual(updatedStock);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		// The product_stock row was updated (no fallback insert into product_stock),
		// but adjustStock now also appends a stock_movements audit row via
		// insert(stockMovements) — so insert IS called exactly once for the audit.
		expect(mockInsert).toHaveBeenCalledTimes(1);
		const movementArg = mockInsertValues.mock.calls[0]![0];
		expect(movementArg.delta).toBe(10);
		expect(movementArg.quantityAfter).toBe(110);
		expect(movementArg.reason).toBe("adjustment");
	});

	test("throws 'Insufficient stock' for a negative delta when no row is updated", async () => {
		// Negative delta: the gated update() returns [] (no row at/above zero).
		// Current behavior deducts only against existing stock and refuses to
		// create a negative-quantity row, throwing a BAD_REQUEST instead.
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(adjustStock(mockTenantDb, "p1", "br1", -5)).rejects.toThrow(
			"Insufficient stock",
		);
		// No product_stock insert and no audit insert when the deduction is refused.
		expect(mockInsert).not.toHaveBeenCalled();
	});

	test("inserts a new product_stock row for a positive delta when none exists", async () => {
		// Positive delta, update() returns [] (no existing record) → fall back to
		// insert(productStock), then append a stock_movements audit row.
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		// First insert (productStock).returning() → the new row.
		const newStockRow = {
			id: "ps-new",
			productId: "p1",
			branchId: "br1",
			quantity: 5,
		};
		mockReturning.mockResolvedValueOnce([newStockRow]);

		const result = await adjustStock(mockTenantDb, "p1", "br1", 5);

		expect(result as any).toEqual(newStockRow);
		// Two inserts: productStock row + stock_movements audit row.
		expect(mockInsert).toHaveBeenCalledTimes(2);
		const stockValuesArg = mockInsertValues.mock.calls[0]![0];
		expect(stockValuesArg.quantity).toBe(5);
		const movementArg = mockInsertValues.mock.calls[1]![0];
		expect(movementArg.delta).toBe(5);
		expect(movementArg.quantityAfter).toBe(5);
	});

	test("throws 'Failed to adjust stock' when positive-delta insert returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		// productStock insert returns [] → row is undefined → throw before audit.
		mockReturning.mockResolvedValueOnce([]);

		await expect(adjustStock(mockTenantDb, "p1", "br1", 10)).rejects.toThrow(
			"Failed to adjust stock",
		);
	});
});
