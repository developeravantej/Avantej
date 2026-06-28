import { describe, it, expect, vi, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

// Current org + a member so organizationId resolves; hasPermission → true so
// every permission-gated badge query enables and fires.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		isLoading: false,
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
							accessibleNodeIds: ["node-region-1", "branch-x"],
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

// Scope narrowed to a single branch → scopeNodeId is that node id.
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

// Real switcher needs the full ScopeProvider context — render nothing.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Detail panels fire their own queries — stub them so the test stays on the
// launchpad's own badge/data-fetching layer.
vi.mock("@/components/pages/launchpad/panels", () => ({
	LaunchpadPanel: () => <div data-testid="launchpad-panel" />,
}));

import { DashboardLaunchpad } from "@/components/pages/launchpad/DashboardLaunchpad";

describe("DashboardLaunchpad scope injection", () => {
	it("injects scopeNodeId as branchId on every scope-aware badge query", async () => {
		renderWithProviders(<DashboardLaunchpad />);

		const expectBranch = (fn: Mock) => {
			expect(fn.mock.calls.length).toBeGreaterThan(0);
			expect(fn.mock.calls[0]?.[0]).toMatchObject({
				organizationId: "org-1",
				branchId: "branch-x",
			});
		};

		await waitFor(() =>
			expectBranch(mockClient.analytics.getDashboardKpis as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.installments.listUpcoming as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.payouts.list as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.refunds.list as unknown as Mock),
		);
	});
});
