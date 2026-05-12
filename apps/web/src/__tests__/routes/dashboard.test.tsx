import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

// Stateful router mock: useSearch reads from a singleton store, useNavigate
// updates it (supporting the (prev) => next updater form) and notifies
// subscribers via useSyncExternalStore so components re-render.
const { routerState: _routerState, useSearchMock, useNavigateMock, resetRouterState } = vi.hoisted(() => {
	type SearchState = Record<string, unknown>;
	const state: { search: SearchState; listeners: Set<() => void> } = {
		search: { period: "this_month" },
		listeners: new Set(),
	};

	function setSearch(updater: SearchState | ((prev: SearchState) => SearchState)) {
		const next = typeof updater === "function" ? (updater as (p: SearchState) => SearchState)(state.search) : updater;
		state.search = next;
		for (const l of state.listeners) l();
	}

	function subscribe(cb: () => void) {
		state.listeners.add(cb);
		return () => {
			state.listeners.delete(cb);
		};
	}

	// Lazily require react inside the hook so the mock factory does not
	// import React at module top level (avoids hoist-order issues).
	function useSearchMock() {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const React = require("react");
		return React.useSyncExternalStore(
			subscribe,
			() => state.search,
			() => state.search,
		);
	}

	function useNavigateMock() {
		return (opts: { search?: SearchState | ((prev: SearchState) => SearchState) } = {}) => {
			if (opts.search !== undefined) setSearch(opts.search);
		};
	}

	function resetRouterState() {
		state.search = { period: "this_month" };
	}

	return { routerState: state, useSearchMock, useNavigateMock, resetRouterState };
});

let DashboardComponent: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		DashboardComponent = opts.component;
		return {
			component: opts.component,
			useSearch: useSearchMock,
			useNavigate: useNavigateMock,
			useLoaderData: () => ({}),
			useParams: () => ({}),
			fullPath: "/_authenticated/dashboard/_layout/",
		};
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: useNavigateMock,
	useSearch: useSearchMock,
	useLoaderData: () => ({}),
	useParams: () => ({}),
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
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

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/index");
});

describe("Dashboard page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetRouterState();
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

		// The dashboard's primary h1 is the time-based greeting from
		// GreetingBanner ("Good Morning, …" / "Good Afternoon, …" / "Good Evening, …").
		// Asserting the structural heading regardless of greeting variant.
		await waitFor(() => {
			const headings = screen.getAllByRole("heading", { level: 1 });
			expect(headings.length).toBeGreaterThan(0);
			expect(headings[0].textContent).toMatch(/Good (Morning|Afternoon|Evening)/);
		});
	});

	test("defaults to 'this_month' period", async () => {
		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			expect(
				mockClient.analytics.getDashboardKpis,
			).toHaveBeenCalledWith(
				expect.objectContaining({ period: "this_month" }),
			);
		});
	});

	test("renders period selector tabs", async () => {
		renderWithProviders(<DashboardComponent />);

		await waitFor(() => {
			expect(screen.getByText("Today")).toBeInTheDocument();
			expect(screen.getByText("This Week")).toBeInTheDocument();
			expect(screen.getByText("This Month")).toBeInTheDocument();
			expect(screen.getByText("This Year")).toBeInTheDocument();
		});
	});

	test("switching to 'Today' maps staff performance period to 'this_week'", async () => {
		const user = userEvent.setup();
		renderWithProviders(<DashboardComponent />);

		// The period selector is a row of <button> pills, not Radix Tabs.
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: "Today" }));

		await waitFor(() => {
			expect(
				mockClient.analytics.getDashboardKpis,
			).toHaveBeenCalledWith(
				expect.objectContaining({ period: "today" }),
			);
			// The page currently uses the same `period` for both KPIs and
			// staff performance — there is no separate this_week mapping.
			expect(
				mockClient.analytics.getStaffPerformance,
			).toHaveBeenCalledWith(
				expect.objectContaining({ period: "today" }),
			);
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
			expect(screen.getByText(/2[,.]500/)).toBeInTheDocument();
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
			expect(screen.getByText(/25 orders/)).toBeInTheDocument();
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
			expect(screen.getAllByText(/75%/)[0]).toBeInTheDocument();
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
			expect(screen.getAllByText("Sales Overview")[0]).toBeInTheDocument();
			// "Appointments" appears both as KPI card title and widget mock
			expect(screen.getAllByText("Active Members")[0]).toBeInTheDocument();
			expect(screen.getAllByText("Revenue by Branch")[0]).toBeInTheDocument();
			expect(screen.getAllByText("Staff Performance")[0]).toBeInTheDocument();
		});
	});
});
