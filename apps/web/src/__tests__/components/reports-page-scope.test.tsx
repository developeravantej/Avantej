import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// useUserContext supplies the org id every scoped query is gated on (enabled: !!organizationId).
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
	}),
}));

// ScopeProvider.useScope is the switcher context this task wires in.
// scopeNodeId is the EXACT value the page must inject as `branchId`.
const useScopeMock = vi.fn();
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => useScopeMock(),
}));

// The page header renders <ScopeSwitcher/>, which consumes the FULL useScope
// contract (scopeNodes, isScopeReady, …). This test stubs only the
// scopeNodeId/isAllScope slice, so render the switcher as a no-op — its own
// rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

import { ReportsPage } from "@/components/pages/reports/ReportsPage";

// Resolve every analytics query to a valid (non-undefined) shape so TanStack
// Query never throws "Query data cannot be undefined" and the page renders cleanly.
function primeAnalyticsMocks() {
	mockClient.analytics.getDashboardKpis.mockResolvedValue({
		totalSales: 0,
		previousPeriodSales: 0,
		activeMembersCount: 0,
		completedAppointments: 0,
		totalAppointments: 0,
		from: new Date(),
		to: new Date(),
		revenueByBranch: [],
	});
	mockClient.analytics.getRevenueSeries.mockResolvedValue([]);
	mockClient.analytics.getMemberCountSeries.mockResolvedValue([]);
	mockClient.analytics.getChurnSeries.mockResolvedValue([]);
	mockClient.analytics.getLtvSeries.mockResolvedValue([]);
	mockClient.analytics.getClassFillRateSeries.mockResolvedValue([]);
	mockClient.analytics.getStaffPerformance.mockResolvedValue([]);
}

describe("ReportsPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		primeAnalyticsMocks();
	});

	it("injects scopeNodeId as branchId on the 3 branch-aware analytics queries", async () => {
		useScopeMock.mockReturnValue({
			scopeNodeId: "branch-x",
			isAllScope: false,
		});

		renderWithProviders(<ReportsPage />);

		await waitFor(() => {
			expect(mockClient.analytics.getDashboardKpis).toHaveBeenCalled();
			expect(mockClient.analytics.getRevenueSeries).toHaveBeenCalled();
			expect(mockClient.analytics.getStaffPerformance).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → first arg is the input.
		expect(
			mockClient.analytics.getDashboardKpis.mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
		expect(
			mockClient.analytics.getRevenueSeries.mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
		expect(
			mockClient.analytics.getStaffPerformance.mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});

	it("injects scopeNodeId as branchId on the 4 hierarchy series queries too (Phase 0.5 Group B)", async () => {
		useScopeMock.mockReturnValue({
			scopeNodeId: "branch-x",
			isAllScope: false,
		});

		renderWithProviders(<ReportsPage />);

		await waitFor(() => {
			expect(mockClient.analytics.getMemberCountSeries).toHaveBeenCalled();
			expect(mockClient.analytics.getChurnSeries).toHaveBeenCalled();
			expect(mockClient.analytics.getLtvSeries).toHaveBeenCalled();
			expect(mockClient.analytics.getClassFillRateSeries).toHaveBeenCalled();
		});

		// Phase 0.5 Group B added an optional `branchId` to seriesInput, so the
		// page injects scopeNodeId into all 4 series queries as well.
		for (const q of [
			mockClient.analytics.getMemberCountSeries,
			mockClient.analytics.getChurnSeries,
			mockClient.analytics.getLtvSeries,
			mockClient.analytics.getClassFillRateSeries,
		]) {
			expect(q.mock.calls[0][0]).toMatchObject({
				organizationId: "org-1",
				branchId: "branch-x",
			});
		}
	});

	it("passes branchId: undefined when isAllScope (server falls back to full accessibleNodeIds)", async () => {
		useScopeMock.mockReturnValue({ scopeNodeId: undefined, isAllScope: true });

		renderWithProviders(<ReportsPage />);

		await waitFor(() => {
			expect(mockClient.analytics.getDashboardKpis).toHaveBeenCalled();
		});

		const input = mockClient.analytics.getDashboardKpis.mock
			.calls[0][0] as Record<string, unknown>;
		// scopeNodeId is the EXACT injected value → key present, value undefined.
		expect("branchId" in input).toBe(true);
		expect(input.branchId).toBeUndefined();
	});
});
