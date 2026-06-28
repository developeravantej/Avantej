import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// useIsMobile reaches for window.matchMedia (absent in jsdom) — stub it out.
vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

// Current org + an organizations array so organizationId resolves and the
// members.list query enables (enabled: !!organizationId).
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
// Full contract so any field the page reads is present.
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

// The header renders <ScopeSwitcher/>, which consumes the FULL useScope
// contract. This test stubs only the scopeNodeId slice, so render the switcher
// as a no-op — its own rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the data-fetching layer.
vi.mock("@/components/pages/access-control/members/MembersStatsBar", () => ({
	MembersStatsBar: () => <div data-testid="members-stats" />,
}));
vi.mock("@/components/pages/access-control/members/MembersFiltersBar", () => ({
	MembersFiltersBar: () => <div data-testid="members-filters" />,
}));
vi.mock("@/components/pages/access-control/members/MembersGrid", () => ({
	MembersGrid: () => <div data-testid="members-grid" />,
}));
vi.mock(
	"@/components/pages/access-control/members/RoleAssignmentSheet",
	() => ({
		RoleAssignmentSheet: () => <div data-testid="role-assignment" />,
	}),
);
vi.mock("@/components/pages/access-control/members/InviteUserDialog", () => ({
	InviteUserDialog: () => <div data-testid="invite-dialog" />,
}));
vi.mock("@/components/pages/access-control/members/EditUserDialog", () => ({
	EditUserDialog: () => <div data-testid="edit-dialog" />,
}));
vi.mock("@/components/pages/access-control/members/MoveBranchDialog", () => ({
	MoveBranchDialog: () => <div data-testid="move-branch-dialog" />,
}));

import { MembersTabPage } from "@/components/pages/access-control/members-tab";

describe("MembersTabPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve queries to valid (non-undefined) shapes so TanStack Query
		// never throws "Query data cannot be undefined".
		mockClient.members.list.mockResolvedValue([]);
		mockClient.roles.list.mockResolvedValue([]);
		mockClient.hierarchy.listNodes.mockResolvedValue({ nodes: [] });
	});

	it("injects scopeNodeId as hierarchyScopeId on the members grid query", async () => {
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => {
			expect(mockClient.members.list).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) →
		// first arg is the input the server receives.
		expect(mockClient.members.list.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			hierarchyScopeId: "branch-x",
		});
	});
});
