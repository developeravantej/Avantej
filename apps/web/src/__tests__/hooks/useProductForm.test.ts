import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockProductsCreate = vi.fn().mockResolvedValue({ id: "prod-1" });
const mockProductsUpdate = vi.fn().mockResolvedValue({});
const mockProductsListKey = vi.fn().mockReturnValue(["products"]);

const mockOrpc = {
	products: {
		list: {
			key: mockProductsListKey,
		},
	},
};

vi.mock("@/utils/orpc", () => ({
	client: {
		products: {
			create: mockProductsCreate,
			update: mockProductsUpdate,
		},
	},
	orpc: mockOrpc,
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	return ({ children }: { children: React.ReactNode }) =>
		React.createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
}

describe("useProductForm hook", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProductsCreate.mockResolvedValue({ id: "prod-1" });
		mockProductsUpdate.mockResolvedValue({});
	});

	test("createMutation calls client.products.create with organizationId and input fields", async () => {
		const { useProductForm } = await import("@/hooks/useProductForm");
		const { result } = renderHook(() => useProductForm("org-test"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			result.current.createMutation.mutate({
				sku: "SKU-001",
				name: "Test Product",
				uomId: "uom-1",
				price: 4999,
			});
		});

		await vi.waitFor(() => {
			expect(mockProductsCreate).toHaveBeenCalledWith({
				organizationId: "org-test",
				sku: "SKU-001",
				name: "Test Product",
				uomId: "uom-1",
				price: 4999,
			});
		});
	});

	test("updateMutation calls client.products.update with id and fields", async () => {
		const { useProductForm } = await import("@/hooks/useProductForm");
		const { result } = renderHook(() => useProductForm("org-test"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			result.current.updateMutation.mutate({
				id: "prod-42",
				name: "Updated Product",
				price: 9999,
			});
		});

		await vi.waitFor(() => {
			expect(mockProductsUpdate).toHaveBeenCalledWith({
				organizationId: "org-test",
				id: "prod-42",
				name: "Updated Product",
				price: 9999,
			});
		});
	});

	test("price is passed through as integer cents without conversion", async () => {
		const { useProductForm } = await import("@/hooks/useProductForm");
		const { result } = renderHook(() => useProductForm("org-test"), {
			wrapper: createWrapper(),
		});

		// 2999 cents = RM 29.99 — hook should pass this value unchanged
		await act(async () => {
			result.current.createMutation.mutate({
				sku: "SKU-002",
				name: "Cheap Item",
				uomId: "uom-2",
				price: 2999,
			});
		});

		await vi.waitFor(() => {
			expect(mockProductsCreate).toHaveBeenCalledWith(
				expect.objectContaining({ price: 2999 }),
			);
		});
	});

	test("calls toast.success after successful create", async () => {
		const { toast } = await import("sonner");
		const { useProductForm } = await import("@/hooks/useProductForm");
		const { result } = renderHook(() => useProductForm("org-test"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			result.current.createMutation.mutate({
				sku: "SKU-003",
				name: "Another Product",
				uomId: "uom-1",
				price: 1000,
			});
		});

		await vi.waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith("Product created successfully");
		});
	});

	test("calls toast.success after successful update", async () => {
		const { toast } = await import("sonner");
		const { useProductForm } = await import("@/hooks/useProductForm");
		const { result } = renderHook(() => useProductForm("org-test"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			result.current.updateMutation.mutate({
				id: "prod-99",
				name: "Updated Name",
			});
		});

		await vi.waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith("Product updated successfully");
		});
	});
});
