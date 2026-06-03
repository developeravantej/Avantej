import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

let CustomersV2Page: React.ComponentType;
const useSearchMock = vi.fn();
const useNavigateMock = vi.fn().mockReturnValue(vi.fn());

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		CustomersV2Page = opts.component;
		return {
			component: opts.component,
			useSearch: useSearchMock,
			useNavigate: useNavigateMock,
		};
	},
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useNavigate: useNavigateMock,
}));
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: {
		invalidateQueries: () => Promise.resolve(),
		setQueryData: () => {},
		getQueryData: () => undefined,
		clear: () => {},
	},
}));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Org",
					hierarchy: { nodes: [], member: { accessibleNodeIds: [] } },
				},
			],
		},
		hasPermission: (perm: string) =>
			["customer_management:read", "user_management:create"].includes(perm),
		hasRole: () => false,
	}),
}));
vi.mock("@/hooks/useDebounce", () => ({
	useDebounce: (val: unknown) => val,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Stub heavy sub-panels
vi.mock("@/components/customers/customers-filter-sidebar", () => ({
	CustomersFilterSidebar: ({
		customers,
		isLoading,
	}: {
		customers: Array<{ id: string; name: string }>;
		isLoading: boolean;
	}) => (
		<div data-testid="filter-sidebar">
			{isLoading ? "Loading…" : `${customers.length} customers`}
		</div>
	),
}));
vi.mock("@/components/customers/customer-profile-panel", () => ({
	CustomerProfilePanel: () => <div data-testid="profile-panel">Profile</div>,
}));
vi.mock("@/components/customers/customer-detail-sheet", () => ({
	CustomerDetailSheet: () => null,
}));
vi.mock("@/components/invitations/create-invitation-dialog", () => ({
	CreateInvitationDialog: () => null,
}));
vi.mock("@/components/pages/customers/v2", () => ({
	PackagesTab: () => <div data-testid="packages-tab">Packages</div>,
}));
vi.mock("@/components/pos/pos-workflow", () => ({
	PosWorkflow: () => <div data-testid="pos-workflow">POS</div>,
}));

const defaultSearch = {
	tab: "customers",
	customer: undefined,
	showDeleted: undefined,
};

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/customers/v2/view");
});

describe("CustomersV2Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSearchMock.mockReturnValue(defaultSearch);
		useNavigateMock.mockReturnValue(vi.fn());
		mockClient.customerDirectory.list.mockResolvedValue({ rows: [], total: 0 });
	});

	it("renders page heading", async () => {
		renderWithProviders(<CustomersV2Page />);
		await waitFor(() => {
			// Breadcrumb "Customers / Directory" — no heading role, just text
			expect(screen.getByText("Customers")).toBeInTheDocument();
		});
	});

	it("renders Add Customer button", async () => {
		renderWithProviders(<CustomersV2Page />);
		await waitFor(() => {
			// Tab pills replaced by Add Customer action button
			expect(
				screen.getByRole("button", { name: /add customer/i }),
			).toBeInTheDocument();
		});
	});

	it("shows 0 customers count initially", async () => {
		renderWithProviders(<CustomersV2Page />);
		await waitFor(() => {
			expect(screen.getByText(/0\s*customer/i)).toBeInTheDocument();
		});
	});

	it("renders Add Customer button when has permission", async () => {
		renderWithProviders(<CustomersV2Page />);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add customer/i }),
			).toBeInTheDocument();
		});
	});

	it("shows filter sidebar", async () => {
		renderWithProviders(<CustomersV2Page />);
		await waitFor(() => {
			expect(screen.getByTestId("filter-sidebar")).toBeInTheDocument();
		});
	});

	it("shows empty pane when no customer selected", async () => {
		mockClient.customerDirectory.list.mockResolvedValue({ rows: [], total: 0 });
		renderWithProviders(<CustomersV2Page />);
		await waitFor(() => {
			expect(screen.getByText("No customers yet")).toBeInTheDocument();
		});
	});

	it("shows customer profile panel when a customer is selected", async () => {
		useSearchMock.mockReturnValue({ ...defaultSearch, customer: "member-99" });
		mockClient.customerDirectory.list.mockResolvedValue({
			rows: [
				{
					memberId: "member-99",
					userId: "user-99",
					name: "Charlie Client",
					email: "charlie@example.com",
					isDeleted: null,
				},
			],
			total: 1,
		});
		renderWithProviders(<CustomersV2Page />);
		await waitFor(() => {
			expect(screen.getByTestId("profile-panel")).toBeInTheDocument();
		});
	});
});
