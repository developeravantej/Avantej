import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let ProductsViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		ProductsViewPage = opts.component;
		return {
			component: opts.component,
			useSearch: vi.fn().mockReturnValue({ tab: "products" }),
			useNavigate: vi.fn().mockReturnValue(vi.fn()),
		};
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));

// orpc is used for queryOptions — stub it to delegate to mockClient at call time
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: {
		products: {
			list: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["products", "list", input],
					queryFn: () => mockClient.products.list(input as never),
				}),
				key: () => ["products", "list"],
			},
		},
		brands: {
			list: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["brands", "list", input],
					queryFn: () => mockClient.brands.list(input as never),
				}),
				key: () => ["brands", "list"],
			},
		},
		productCategories: {
			list: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["productCategories", "list", input],
					queryFn: () => mockClient.productCategories.list(input as never),
				}),
				key: () => ["productCategories", "list"],
			},
		},
		suppliers: {
			list: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["suppliers", "list", input],
					queryFn: () => mockClient.suppliers.list(input as never),
				}),
				key: () => ["suppliers", "list"],
			},
		},
		unitsOfMeasure: {
			list: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["unitsOfMeasure", "list", input],
					queryFn: () => mockClient.unitsOfMeasure.list(input as never),
				}),
				key: () => ["unitsOfMeasure", "list"],
			},
		},
	},
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee" },
		hasPermission: vi.fn().mockReturnValue(true),
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/products/view"
	);
});

describe("Products page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.products.list.mockResolvedValue([]);
		mockClient.products.create.mockResolvedValue({ id: "prod-1" });
		mockClient.products.update.mockResolvedValue({});
		mockClient.brands.list.mockResolvedValue([]);
		mockClient.productCategories.list.mockResolvedValue([]);
		mockClient.suppliers.list.mockResolvedValue([]);
		mockClient.unitsOfMeasure.list.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<ProductsViewPage />);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
		});
	});

	test("calls client.products.list on mount", async () => {
		renderWithProviders(<ProductsViewPage />);

		await waitFor(() => {
			expect(mockClient.products.list).toHaveBeenCalled();
		});
	});

	test("shows product data in the table", async () => {
		mockClient.products.list.mockResolvedValue([
			{
				id: "p1",
				sku: "SKU001",
				name: "Widget",
				price: 2550,
				brandId: null,
				categoryId: null,
				supplierId: null,
				uomId: "u1",
				barcode: null,
				type: null,
				conversionFactor: null,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<ProductsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Widget")).toBeInTheDocument();
		});
	});

	test("formats price as MYR currency (2550 cents = RM 25.50)", async () => {
		mockClient.products.list.mockResolvedValue([
			{
				id: "p1",
				sku: "SKU001",
				name: "Widget",
				price: 2550,
				brandId: null,
				categoryId: null,
				supplierId: null,
				uomId: "u1",
				barcode: null,
				type: null,
				conversionFactor: null,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<ProductsViewPage />);

		await waitFor(() => {
			// formatPrice uses Intl.NumberFormat en-MY: "MYR 25.50" or "RM25.50"
			expect(screen.getByText(/25[.,]50/)).toBeInTheDocument();
		});
	});
});
