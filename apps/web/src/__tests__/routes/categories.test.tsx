import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";

// Local mocks — defined before vi.mock factories execute
const mockProductCategoriesList = vi.fn().mockResolvedValue([]);
const mockProductCategoriesCreate = vi.fn().mockResolvedValue({ id: "cat-1" });
const mockProductCategoriesUpdate = vi.fn().mockResolvedValue({});
const mockProductCategoriesDelete = vi.fn().mockResolvedValue({});

// Capture the component registered by createFileRoute
let CategoriesViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		CategoriesViewPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/utils/orpc", () => ({
	client: {
		productCategories: {
			list: (...args: unknown[]) => mockProductCategoriesList(...args),
			create: (...args: unknown[]) => mockProductCategoriesCreate(...args),
			update: (...args: unknown[]) => mockProductCategoriesUpdate(...args),
			delete: (...args: unknown[]) => mockProductCategoriesDelete(...args),
		},
	},
	orpc: {
		productCategories: {
			list: {
				key: () => ["productCategories", "list"],
			},
		},
	},
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee" },
	}),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/categories/view");
});

describe("Categories page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProductCategoriesList.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<CategoriesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("No results.")).toBeInTheDocument();
		});
	});

	test("uses productCategories (not categories) — productCategories.list is called", async () => {
		renderWithProviders(<CategoriesViewPage />);

		await waitFor(() => {
			// This verifies the page calls productCategories.list, not categories.list
			expect(mockProductCategoriesList).toHaveBeenCalled();
		});
	});

	test("renders the Add Category button", async () => {
		renderWithProviders(<CategoriesViewPage />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add category/i }),
			).toBeInTheDocument();
		});
	});

	test("shows category name in table when data is returned", async () => {
		mockProductCategoriesList.mockResolvedValue([
			{
				id: "c1",
				name: "Clothing",
				externalCode: "CLO",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<CategoriesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Clothing")).toBeInTheDocument();
		});
	});
});
