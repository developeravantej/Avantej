import { describe, it, expect, vi, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// <Link> needs router context jsdom lacks — stub to render children.
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// oRPC: client stubs + queryOptions wired through the SAME mock client so the
// listLedger queryFn resolves back to mockClient.commissionSplits.listLedger
// with the exact input object.
vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Org id + commission read permission so the ledger query enables
// (enabled: !!organizationId && canRead).
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: () => true,
	}),
}));

// Scope narrowed to a single branch → scopeNodeId is that node id, which the
// page must inject as `branchId` on the ledger query.
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

// The toolbar renders <ScopeSwitcher/>, which consumes the FULL useScope
// contract. This test stubs only the scopeNodeId slice, so render the switcher
// as a no-op — its own rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// boneyard-js Skeleton gates the body on a registry context jsdom lacks —
// render children directly so the data-fetching layer mounts cleanly.
vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AllCommissionsPage } from "@/components/pages/commissions/all-tab";

describe("AllCommissionsPage scope injection", () => {
	it("injects scopeNodeId as branchId on the commission ledger query", async () => {
		// Resolve a valid (non-undefined) shape so TanStack Query doesn't throw.
		mockClient.commissionSplits.listLedger.mockResolvedValue({
			rows: [],
			totals: { pending: 0, approved: 0, paid: 0 },
		});

		renderWithProviders(<AllCommissionsPage />);

		await waitFor(() => {
			expect(mockClient.commissionSplits.listLedger).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → the
		// first arg is the query input object.
		expect(
			(mockClient.commissionSplits.listLedger as unknown as Mock).mock
				.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
