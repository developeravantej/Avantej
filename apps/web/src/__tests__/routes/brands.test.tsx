import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";

// Local mock for brands.list — defined before vi.mock factories run
const mockBrandsList = vi.fn().mockResolvedValue([]);
const mockBrandsCreate = vi.fn().mockResolvedValue({ id: "brand-1" });
const mockBrandsUpdate = vi.fn().mockResolvedValue({});
const mockBrandsDelete = vi.fn().mockResolvedValue({});

// Capture the component registered by createFileRoute
let BrandsViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		BrandsViewPage = opts.component;
		return { component: opts.component };
	},
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
	}),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/brands/view");
});

describe("Brands page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBrandsList.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<BrandsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("No results.")).toBeInTheDocument();
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

	test("renders Filter brands input", async () => {
		renderWithProviders(<BrandsViewPage />);

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText("Filter brands..."),
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
