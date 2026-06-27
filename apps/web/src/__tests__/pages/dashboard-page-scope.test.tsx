import { describe, it, expect, vi, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// <Link> needs router context jsdom lacks — stub to render children.
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

// Current org + a member so organizationId resolves and every query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness",
					role: "admin",
					hierarchy: {
						nodes: [],
						member: {
							id: "member-caller",
							role: "admin",
							hierarchyScopeId: "node-region-1",
							hierarchyScopeName: "Region",
							accessibleNodeIds: ["node-region-1", "node-branch-1"],
						},
					},
				},
			],
		},
		hasRole: () => true,
		hasPermission: () => true,
		hasAnyPermission: () => true,
	}),
}));

// Scope switcher narrowed to a single branch → scopeNodeId is that node id.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: "node-branch-1",
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["node-region-1", "node-branch-1"],
		scopeNodes: [],
		topAccessibleNodeId: "node-region-1",
		isAllScope: false,
		scopeNodeId: "node-branch-1",
		isScopeReady: true,
	}),
}));

// Presentational children mocked → keep the test on the data-fetching layer
// (and avoid recharts/ResizeObserver noise from the trend card).
vi.mock("@/components/pages/dashboard/DashboardHeader", () => ({
	DashboardHeader: () => <div data-testid="dashboard-header" />,
}));
vi.mock("@/components/pages/dashboard/HeroSection", () => ({
	HeroSection: () => <div data-testid="hero" />,
}));
vi.mock("@/components/pages/dashboard/RevenueTrendCard", () => ({
	RevenueTrendCard: () => <div data-testid="revenue-trend" />,
}));
vi.mock("@/components/pages/dashboard/RevenueByBranchCard", () => ({
	RevenueByBranchCard: () => <div data-testid="revenue-by-branch" />,
}));
vi.mock("@/components/pages/dashboard/TopPerformersCard", () => ({
	TopPerformersCard: () => <div data-testid="top-performers" />,
}));
vi.mock("@/components/pages/dashboard/RecentActivityCard", () => ({
	RecentActivityCard: () => <div data-testid="recent-activity" />,
}));
vi.mock("@/components/pages/dashboard/TodayAppointmentsCard", () => ({
	TodayAppointmentsCard: () => <div data-testid="today-appts" />,
}));
vi.mock("@/components/pages/dashboard/PendingApprovalsInline", () => ({
	PendingApprovalsInline: () => <div data-testid="pending-approvals" />,
}));

import { DashboardPage } from "@/components/pages/dashboard/DashboardPage";

describe("DashboardPage scope injection", () => {
	it("injects scopeNodeId as branchId on every scope-aware analytics query", async () => {
		renderWithProviders(
			<DashboardPage period="this_month" onSelectPeriod={() => {}} />,
		);

		const expectBranch = (fn: Mock) => {
			expect(fn.mock.calls.length).toBeGreaterThan(0);
			expect(fn.mock.calls[0]?.[0]).toMatchObject({
				organizationId: "org-1",
				branchId: "node-branch-1",
			});
		};

		// getDashboardKpis fires twice (selected period + "today") — both narrowed.
		await waitFor(() =>
			expectBranch(mockClient.analytics.getDashboardKpis as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.analytics.getStaffPerformance as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.salesOrders.largestToday as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.members.newToday as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.auditLogs.list as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.appointments.list as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.analytics.getRevenueSeries as unknown as Mock),
		);
	});
});
