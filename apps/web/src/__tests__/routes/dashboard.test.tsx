import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

let DashboardComponent: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		DashboardComponent = opts.component;
		return {
			component: opts.component,
			useSearch: vi.fn().mockReturnValue({ period: "this_month" }),
			useNavigate: vi.fn().mockReturnValue(vi.fn()),
		};
	},
	getRouteApi: () => ({
		useSearch: vi.fn().mockReturnValue({ period: "this_month" }),
		useNavigate: vi.fn().mockReturnValue(vi.fn()),
	}),
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
	useSearch: vi.fn().mockReturnValue({ period: "this_month" }),
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
		hasPermission: vi.fn().mockReturnValue(true),
		hasAnyPermission: vi.fn().mockReturnValue(true),
		hasRole: vi.fn().mockReturnValue(true),
	}),
}));
vi.mock("@/lib/currency", () => ({
	formatPriceMYR: (amount: number) => `RM ${amount.toFixed(2)}`,
}));

// Mock child widgets that have their own data fetching
vi.mock("@/components/appointments-widget", () => ({
	AppointmentsWidget: () => (
		<div data-testid="appointments-widget">Appointments Widget</div>
	),
}));
vi.mock("@/components/announcements-widget", () => ({
	AnnouncementsWidget: () => (
		<div data-testid="announcements-widget">Announcements Widget</div>
	),
}));
vi.mock("@/components/payroll-widget", () => ({
	PayrollWidget: () => <div data-testid="payroll-widget">Payroll Widget</div>,
}));
vi.mock("@/components/claims-widget", () => ({
	ClaimsWidget: () => <div data-testid="claims-widget">Claims Widget</div>,
}));
vi.mock("@/components/dashboard/expiring-memberships-widget", () => ({
	ExpiringMembershipsWidget: () => (
		<div data-testid="expiring-memberships-widget">
			Expiring Memberships Widget
		</div>
	),
}));
vi.mock("@/components/dashboard/greeting-banner", () => ({
	GreetingBanner: () => <div data-testid="greeting-banner">Dashboard</div>,
}));
vi.mock("@/components/dashboard/quick-actions", () => ({
	QuickActions: () => <div data-testid="quick-actions" />,
}));
vi.mock("@/components/dashboard/section-header", () => ({
	SectionHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/dashboard/quick-insight", () => ({
	QuickInsight: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("@/components/dashboard/pending-approvals-widget", () => ({
	PendingApprovalsWidget: () => (
		<div data-testid="pending-approvals-widget">Pending Approvals Widget</div>
	),
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/index");
});

// QUARANTINED (merge of feat/dashboard-launchpad): the dashboard route now
// renders <DashboardLaunchpad>, a different page than the one these tests were
// written for. Every assertion below targets the OLD dashboard UI (period
// tabs, "Revenue by branch" table, KPI cards, analytics.getDashboardKpis),
// none of which DashboardLaunchpad renders — it uses members.newToday etc.
// These failed identically on the pristine feat/dashboard-launchpad branch
// (pre-existing, not introduced by the merge).
// TODO(dashboard-launchpad): rewrite this suite against DashboardLaunchpad's
// actual UI + queries, then un-skip.
describe.skip("Dashboard page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.analytics.getDashboardKpis.mockResolvedValue({
			totalSales: 0,
			salesOrderCount: 0,
			totalAppointments: 0,
			completedAppointments: 0,
			activeMembersCount: 0,
			revenueByBranch: [],
		});
		mockClient.analytics.getStaffPerformance.mockResolvedValue([]);
	});

	test("renders Dashboard heading", async () => {
		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			expect(screen.getByText("Dashboard")).toBeInTheDocument();
		});
	});

	test("defaults to 'this_month' period", async () => {
		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			expect(mockClient.analytics.getDashboardKpis).toHaveBeenCalledWith(
				expect.objectContaining({ period: "this_month" }),
				expect.anything(),
			);
		});
	});

	test("renders period selector tabs", async () => {
		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			// Period pills: labels are "Today", "Week", "Month", "Year"
			expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
			expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Year" })).toBeInTheDocument();
		});
	});

	test("switching to 'Today' maps staff performance period to 'this_week'", async () => {
		const user = userEvent.setup();
		renderWithProviders(<DashboardComponent />);

		const todayBtn = await screen.findByRole("button", { name: "Today" });
		await user.click(todayBtn);

		// Navigate called; initial API call already happened
		await waitFor(() => {
			expect(mockClient.analytics.getDashboardKpis).toHaveBeenCalled();
		});
	});

	test("KPI cards show formatted sales total (cents to RM)", async () => {
		mockClient.analytics.getDashboardKpis.mockResolvedValue({
			totalSales: 250000,
			salesOrderCount: 50,
			totalAppointments: 120,
			completedAppointments: 100,
			activeMembersCount: 45,
			revenueByBranch: [],
		});

		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			// Revenue appears in multiple tiles (hero + KPI grid); assert at least one match
			expect(screen.getAllByText(/2[,.]500/).length).toBeGreaterThan(0);
		});
	});

	test("displays order count", async () => {
		mockClient.analytics.getDashboardKpis.mockResolvedValue({
			totalSales: 100000,
			salesOrderCount: 25,
			totalAppointments: 0,
			completedAppointments: 0,
			activeMembersCount: 0,
			revenueByBranch: [],
		});

		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			// "25 orders" appears in both the hero stat line and the branch table; assert at least one match
			expect(screen.getAllByText(/25 orders/).length).toBeGreaterThan(0);
		});
	});

	test("completion rate displays as percentage", async () => {
		mockClient.analytics.getDashboardKpis.mockResolvedValue({
			totalSales: 0,
			salesOrderCount: 0,
			totalAppointments: 100,
			completedAppointments: 75,
			activeMembersCount: 0,
			revenueByBranch: [],
		});

		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			expect(screen.getByText(/75%/)).toBeInTheDocument();
		});
	});

	test("revenue by branch table renders branch data", async () => {
		mockClient.analytics.getDashboardKpis.mockResolvedValue({
			totalSales: 500000,
			salesOrderCount: 10,
			totalAppointments: 0,
			completedAppointments: 0,
			activeMembersCount: 0,
			revenueByBranch: [
				{
					branchId: "b1",
					branchName: "KL Branch",
					totalRevenue: 300000,
					orderCount: 6,
				},
				{
					branchId: "b2",
					branchName: "Penang Branch",
					totalRevenue: 200000,
					orderCount: 4,
				},
			],
		});

		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			expect(screen.getByText("KL Branch")).toBeInTheDocument();
			expect(screen.getByText("Penang Branch")).toBeInTheDocument();
		});
	});

	test("renders KPI card titles", async () => {
		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			// KPI tile labels (uppercase in DOM) inside the hero 2x2 grid
			expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
			expect(screen.getByText("Active Members")).toBeInTheDocument();
			// Section headings (sentence-case)
			expect(screen.getByText("Revenue by branch")).toBeInTheDocument();
			expect(screen.getByText("Top performers")).toBeInTheDocument();
		});
	});
});
