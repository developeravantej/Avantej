import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));

// useUserContext supplies the org id every scoped query is gated on
// (enabled: !!organizationId && !!branchId && canRead) plus the read permission.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: () => true,
	}),
}));

// ScopeProvider.useScope is the switcher context this task wires in. scopeNodeId
// is the EXACT value the page must inject as `branchId` on both check-in queries.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: "branch-x",
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["node-region-1", "branch-x"],
		scopeNodes: [],
		topAccessibleNodeId: "node-region-1",
		isAllScope: false,
		scopeNodeId: "branch-x",
		isScopeReady: true,
	}),
}));

// The filter band renders <ScopeSwitcher/>, which consumes the FULL useScope
// contract (scopeNodes, isScopeReady, …). This test stubs only the
// scopeNodeId slice, so render the switcher as a no-op — its own rendering is
// covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the data-fetching layer.
vi.mock("@/components/attendance/check-ins-log", () => ({
	CheckInsLog: () => <div data-testid="check-ins-log" />,
}));
vi.mock("@/components/attendance/today-bookings", () => ({
	TodayBookingsSection: () => <div data-testid="today-bookings" />,
}));
vi.mock("@/components/attendance/drop-in-form", () => ({
	DropInForm: () => <div data-testid="drop-in-form" />,
}));

import { AttendanceTab } from "@/components/attendance/attendance-tab";

describe("AttendanceTab scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve both queries to valid (non-undefined) shapes so TanStack Query
		// never throws "Query data cannot be undefined".
		mockClient.checkIns.list.mockResolvedValue({ rows: [], total: 0 });
		mockClient.checkIns.listTodaysBookings.mockResolvedValue([]);
	});

	it("injects scopeNodeId as branchId on checkIns.list and listTodaysBookings", async () => {
		renderWithProviders(<AttendanceTab />);

		await waitFor(() => {
			expect(mockClient.checkIns.list).toHaveBeenCalled();
			expect(mockClient.checkIns.listTodaysBookings).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, … }) → first
		// arg is the input. scopeNodeId ("branch-x") is injected as branchId.
		expect(mockClient.checkIns.list.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
		expect(
			mockClient.checkIns.listTodaysBookings.mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
