import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let RouteComponent: React.ComponentType;
const useSearchMock = vi.fn();
const useNavigateMock = vi.fn().mockReturnValue(vi.fn());

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		RouteComponent = opts.component;
		return {
			component: opts.component,
			useSearch: useSearchMock,
			fullPath: "/_authenticated/dashboard/_layout/sales/view",
		};
	},
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
	useNavigate: useNavigateMock,
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
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
		hasPermission: () => true,
		hasRole: () => true,
	}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Stub heavy table components
vi.mock("@/components/tables/sales/view/data-table", () => ({
	default: ({ emptyTitle }: { emptyTitle: string }) => (
		<div data-testid="sales-table">{emptyTitle}</div>
	),
}));
vi.mock("@/components/tables/payment/view/data-table", () => ({
	default: ({ emptyTitle }: { emptyTitle: string }) => (
		<div data-testid="payment-table">{emptyTitle}</div>
	),
}));

const defaultSearch = {
	from: "",
	to: "",
	status: "",
	branchId: "",
	page: 1,
	period: undefined,
	kpiPeriod: "month" as const,
	refundStatus: "all" as const,
	tab: "sales" as const,
	search: "",
};

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/sales/view");
});

describe("Sales view (RouteComponent)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSearchMock.mockReturnValue(defaultSearch);
		useNavigateMock.mockReturnValue(vi.fn());
		mockClient.salesOrders.list.mockResolvedValue({ rows: [], total: 0 });
		mockClient.salesOrders.kpiSummary.mockResolvedValue(null);
		mockClient.invoices.list.mockResolvedValue([]);
	});

	it("renders page heading", async () => {
		renderWithProviders(<RouteComponent />);
		await waitFor(() => {
			expect(screen.getByText("Sales & Payments")).toBeInTheDocument();
		});
	});

	it("renders KPI strip with period selector", async () => {
		renderWithProviders(<RouteComponent />);
		await waitFor(() => {
			expect(screen.getByTestId("sales-kpi-strip")).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument();
	});

	it("shows KPI values when kpiSummary resolves", async () => {
		mockClient.salesOrders.kpiSummary.mockResolvedValue({
			totalSalesCents: 250000,
			totalRefundedCents: 5000,
			outstandingCents: 0,
			salesCount: 12,
		});
		renderWithProviders(<RouteComponent />);
		await waitFor(() => {
			// formatPrice(250000, "MYR") → something with RM 2,500
			expect(screen.getByText(/2,500/)).toBeInTheDocument();
		});
		expect(screen.getByText("12 transactions")).toBeInTheDocument();
	});

	it("renders tab bar with Sales Orders and Payments tabs", async () => {
		renderWithProviders(<RouteComponent />);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /sales orders/i })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /payments/i })).toBeInTheDocument();
		});
	});

	it("shows empty sales table when no rows", async () => {
		mockClient.salesOrders.list.mockResolvedValue({ rows: [], total: 0 });
		renderWithProviders(<RouteComponent />);
		await waitFor(() => {
			expect(screen.getByTestId("sales-table")).toBeInTheDocument();
			expect(screen.getByText("No sales found")).toBeInTheDocument();
		});
	});

	it("renders Export CSV and New Sale action buttons", async () => {
		renderWithProviders(<RouteComponent />);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
			expect(screen.getByRole("link", { name: /new sale/i })).toBeInTheDocument();
		});
	});

	it("period selector buttons navigate on click", async () => {
		const navigateFn = vi.fn();
		useNavigateMock.mockReturnValue(navigateFn);
		const user = userEvent.setup();
		renderWithProviders(<RouteComponent />);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: "Today" }));
		expect(navigateFn).toHaveBeenCalled();
	});
});
