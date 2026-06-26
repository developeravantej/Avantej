import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: the page calls client.packageInstances.listMemberships directly inside
// a useQuery queryFn — route it through the shared mock client.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

// useApiMutation (via useUnfreezePackageInstance) imports sonner at module load.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Current org + read permission so organizationId resolves and the query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [],
		},
		hasPermission: () => true,
	}),
}));

// Scope switcher narrowed to a single branch → scopeNodeId is that node id.
// Full contract so any consumer (incl. the real switcher) wouldn't choke.
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

// Header renders <ScopeSwitcher/>, which consumes the full useScope contract.
// Stub it to a no-op — its rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

import { MembershipsPage } from "@/components/pages/packages/memberships-page";

describe("MembershipsPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve to a valid shape so TanStack Query never throws on undefined data.
		mockClient.packageInstances.listMemberships.mockResolvedValue({
			rows: [],
			total: 0,
		});
	});

	it("injects scopeNodeId as branchId on listMemberships", async () => {
		renderWithProviders(<MembershipsPage />);

		await waitFor(() => {
			expect(mockClient.packageInstances.listMemberships).toHaveBeenCalled();
		});

		// Direct client call → first arg is the input object.
		expect(
			(mockClient.packageInstances.listMemberships as unknown as Mock).mock
				.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			filter: "active",
			branchId: "branch-x",
		});
	});
});
