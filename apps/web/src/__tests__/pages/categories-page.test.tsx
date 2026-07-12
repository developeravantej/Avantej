import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: () => true,
	}),
}));

// boneyard-js Skeleton gates the body on a registry context jsdom lacks.
vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The service-category DataTable owns the CRUD dialogs. The page's contract is
// to feed it the fetched rows + organizationId — capture the props to pin the
// wiring without re-testing the table internals.
const tableProps = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/components/tables/service-category/view/columns", () => ({
	columns: [],
}));
vi.mock("@/components/tables/service-category/view/data-table", () => ({
	default: (props: {
		data: Array<{ id: string; name: string }>;
		organizationId: string;
	}) => {
		tableProps.current = props;
		return (
			<div data-testid="categories-table">
				{props.data.map((c) => (
					<span key={c.id}>{c.name}</span>
				))}
			</div>
		);
	},
}));

import { ServiceCategoriesPage } from "@/components/pages/services/categories-page";

const CATEGORIES = [
	{ id: "cat-1", name: "Massage", isActive: true },
	{ id: "cat-2", name: "Training", isActive: true },
];

describe("ServiceCategoriesPage (canonical categories tab)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tableProps.current = null;
		mockClient.serviceCategories.list.mockResolvedValue(CATEGORIES);
	});

	it("fetches serviceCategories.list for the current org and renders rows", async () => {
		renderWithProviders(<ServiceCategoriesPage />);

		await waitFor(() => {
			expect(screen.getByText("Massage")).toBeInTheDocument();
			expect(screen.getByText("Training")).toBeInTheDocument();
		});
		expect(
			(mockClient.serviceCategories.list as unknown as Mock).mock.calls[0][0],
		).toMatchObject({ organizationId: "org-1" });
	});

	it("passes organizationId to the DataTable (CRUD wiring)", async () => {
		renderWithProviders(<ServiceCategoriesPage />);

		// The mocked Skeleton renders children during loading too — wait for the
		// fetched rows before pinning the final props.
		await waitFor(() => {
			expect(screen.getByText("Massage")).toBeInTheDocument();
		});
		expect(tableProps.current).toMatchObject({
			organizationId: "org-1",
			data: CATEGORIES,
			isLoading: false,
		});
	});

	it("shows error state with a working Retry that refetches", async () => {
		(mockClient.serviceCategories.list as unknown as Mock)
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce(CATEGORIES);

		const user = userEvent.setup();
		renderWithProviders(<ServiceCategoriesPage />);

		await waitFor(() => {
			expect(
				screen.getByText("Failed to load service categories."),
			).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => {
			expect(screen.getByText("Massage")).toBeInTheDocument();
		});
		expect(mockClient.serviceCategories.list).toHaveBeenCalledTimes(2);
	});
});
