import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so the
// members.list queryFn resolves back to mockClient.members.list with the exact
// input object the page built.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

// useTrainerActions → useApiMutation imports sonner; stub it so no toast noise.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Current org + organizations array so organizationId resolves and the
// members.list query enables (enabled: !!organizationId).
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [{ id: "org-1", name: "Test Fitness" }],
		},
		hasRole: () => true,
		hasPermission: () => true,
		hasAnyPermission: () => true,
	}),
}));

// Scope narrowed to a single branch → scopeNodeId is the node id the hook must
// inject as members.list `hierarchyScopeId`. Full contract so anything reading
// useScope (incl. the real switcher, were it not mocked) gets a complete shape.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: "branch-x",
		isAllScope: false,
		activeScopeId: "branch-x",
		accessibleNodeIds: ["region-1", "branch-x"],
		scopeNodes: [],
		topAccessibleNodeId: "region-1",
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		isScopeReady: true,
		activeScopeNode: null,
	}),
}));

// The page header renders <ScopeSwitcher/>, which consumes the FULL useScope
// contract. This test only stubs the scopeNodeId slice it cares about, so render
// the switcher as a no-op — its own rendering is covered by ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

import { TrainersListPage } from "@/components/pages/trainers/trainers-list-page";

describe("TrainersListPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve to a valid (non-undefined) shape so TanStack Query renders cleanly.
		mockClient.members.list.mockResolvedValue([]);
		mockClient.trainerTiers.list.mockResolvedValue([]);
	});

	it("injects scopeNodeId as hierarchyScopeId on the members.list trainer roster query", async () => {
		renderWithProviders(<TrainersListPage />);

		await waitFor(() => {
			expect(mockClient.members.list).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → first arg is the input.
		expect(
			(mockClient.members.list as unknown as Mock).mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			role: "trainer",
			hierarchyScopeId: "branch-x",
		});
	});
});
