import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Define the mock orpc object inline (do NOT import from mock-client)
const mockOrpc = {
	brands: {
		list: {
			queryOptions: vi.fn().mockReturnValue({
				queryKey: ["brands"],
				queryFn: () => Promise.resolve([]),
			}),
		},
	},
	productCategories: {
		list: {
			queryOptions: vi.fn().mockReturnValue({
				queryKey: ["categories"],
				queryFn: () => Promise.resolve([]),
			}),
		},
	},
	suppliers: {
		list: {
			queryOptions: vi.fn().mockReturnValue({
				queryKey: ["suppliers"],
				queryFn: () => Promise.resolve([]),
			}),
		},
	},
	unitsOfMeasure: {
		list: {
			queryOptions: vi.fn().mockReturnValue({
				queryKey: ["uoms"],
				queryFn: () => Promise.resolve([]),
			}),
		},
	},
};

vi.mock("@/utils/orpc", () => ({ client: {}, orpc: mockOrpc }));

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: React.ReactNode }) =>
		React.createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
}

describe("useProductData hook", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset all queryOptions mocks to return empty arrays by default
		mockOrpc.brands.list.queryOptions.mockReturnValue({
			queryKey: ["brands"],
			queryFn: () => Promise.resolve([]),
		});
		mockOrpc.productCategories.list.queryOptions.mockReturnValue({
			queryKey: ["categories"],
			queryFn: () => Promise.resolve([]),
		});
		mockOrpc.suppliers.list.queryOptions.mockReturnValue({
			queryKey: ["suppliers"],
			queryFn: () => Promise.resolve([]),
		});
		mockOrpc.unitsOfMeasure.list.queryOptions.mockReturnValue({
			queryKey: ["uoms"],
			queryFn: () => Promise.resolve([]),
		});
	});

	test("returns empty arrays when all queries resolve with empty data", async () => {
		const { useProductData } = await import("@/hooks/useProductData");
		const { result } = renderHook(() => useProductData("org-1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(result.current.brands).toEqual([]);
			expect(result.current.categories).toEqual([]);
			expect(result.current.suppliers).toEqual([]);
			expect(result.current.uoms).toEqual([]);
		});
	});

	test("returns brand data when brands query resolves with items", async () => {
		mockOrpc.brands.list.queryOptions.mockReturnValue({
			queryKey: ["brands"],
			queryFn: () =>
				Promise.resolve([{ id: "b1", name: "Nike", isActive: true }]),
		});

		const { useProductData } = await import("@/hooks/useProductData");
		const { result } = renderHook(() => useProductData("org-1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(result.current.brands).toHaveLength(1);
			expect(result.current.brands[0]).toMatchObject({ id: "b1", name: "Nike" });
		});
	});

	test("calls queryOptions with the correct organizationId input", async () => {
		const { useProductData } = await import("@/hooks/useProductData");
		renderHook(() => useProductData("org-1"), { wrapper: createWrapper() });

		expect(mockOrpc.brands.list.queryOptions).toHaveBeenCalledWith({
			input: { organizationId: "org-1" },
		});
		expect(mockOrpc.productCategories.list.queryOptions).toHaveBeenCalledWith({
			input: { organizationId: "org-1" },
		});
		expect(mockOrpc.suppliers.list.queryOptions).toHaveBeenCalledWith({
			input: { organizationId: "org-1" },
		});
		expect(mockOrpc.unitsOfMeasure.list.queryOptions).toHaveBeenCalledWith({
			input: { organizationId: "org-1" },
		});
	});

	test("returns the correct shape: { brands, categories, suppliers, uoms }", async () => {
		const { useProductData } = await import("@/hooks/useProductData");
		const { result } = renderHook(() => useProductData("org-1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(result.current).toHaveProperty("brands");
			expect(result.current).toHaveProperty("categories");
			expect(result.current).toHaveProperty("suppliers");
			expect(result.current).toHaveProperty("uoms");
		});
	});
});
