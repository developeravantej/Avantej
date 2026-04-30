import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";

// Local mock for brands.list — defined before vi.mock factories run
const mockBrandsList = vi.fn().mockResolvedValue([]);
const mockBrandsCreate = vi.fn().mockResolvedValue({ id: "brand-1" });
const mockBrandsUpdate = vi.fn().mockResolvedValue({});
const mockBrandsDelete = vi.fn().mockResolvedValue({});

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/utils/orpc", () => ({
	client: {
		brands: {
			list: (...args: unknown[]) => mockBrandsList(...args),
			create: (...args: unknown[]) => mockBrandsCreate(...args),
			update: (...args: unknown[]) => mockBrandsUpdate(...args),
			delete: (...args: unknown[]) => mockBrandsDelete(...args),
		},
	},
	orpc: {
		brands: {
			list: {
				key: () => ["brands", "list"],
			},
		},
	},
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee" },
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

import { BrandsTabPage } from "@/components/pages/inventory/brands-tab";
const BrandsViewPage = BrandsTabPage;

describe("Brands page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBrandsList.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<BrandsViewPage />);

		await waitFor(() => {
			expect(screen.getByText(/No brands yet/i)).toBeInTheDocument();
		});
	});

	test("renders the Add Brand button", async () => {
		renderWithProviders(<BrandsViewPage />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add brand/i }),
			).toBeInTheDocument();
		});
	});

	test("renders search brands input", async () => {
		renderWithProviders(<BrandsViewPage />);

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText(/search brands/i),
			).toBeInTheDocument();
		});
	});

	test("shows brand name in table when data is returned", async () => {
		mockBrandsList.mockResolvedValue([
			{
				id: "b1",
				name: "Nike",
				description: "Sports brand",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<BrandsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Nike")).toBeInTheDocument();
		});
	});

	test("calls brands.list during render", async () => {
		renderWithProviders(<BrandsViewPage />);

		await waitFor(() => {
			expect(mockBrandsList).toHaveBeenCalled();
		});
	});
});
