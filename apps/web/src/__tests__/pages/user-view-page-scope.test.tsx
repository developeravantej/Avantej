import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so the
// queryFn resolves back to mockClient.members.list with the exact input object.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

// Current org so organizationId resolves and the members.list query enables.
// hasRole drives callerIsAdmin — return true so the page renders fully.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness",
					role: "admin",
				},
			],
		},
		hasRole: () => true,
		hasPermission: () => true,
		hasAnyPermission: () => true,
	}),
}));

// Scope switcher narrowed to a single branch → scopeNodeId is that node id.
// Full useScope contract so anything reading it stays happy.
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
// contract. Stub it to a no-op — its rendering is covered by ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the data-fetching layer.
vi.mock("@/components/pages/user/RoleGroup", () => ({
	RoleGroup: () => <div data-testid="role-group" />,
}));
vi.mock("@/components/invitations/create-invitation-dialog", () => ({
	CreateInvitationDialog: () => <div data-testid="create-invitation-dialog" />,
}));

import { UserViewPage } from "@/components/pages/user/UserViewPage";

describe("UserViewPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve to a valid array so TanStack Query never throws on undefined.
		(mockClient.members.list as unknown as Mock).mockResolvedValue([]);
	});

	it("injects scopeNodeId as hierarchyScopeId on the members.list query", async () => {
		renderWithProviders(<UserViewPage />);

		await waitFor(() => {
			expect(mockClient.members.list).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → first arg is the input.
		expect(
			(mockClient.members.list as unknown as Mock).mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			hierarchyScopeId: "branch-x",
		});
	});
});
