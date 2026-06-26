import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
// PayoutsTab's api.ts also imports `queryClient`, so stub it too.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// useUserContext gates the run-batch UI. hasPermission → false keeps the test on
// the list-query layer (no members.list fetch, no RunBatchDrawer).
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: () => false,
		hasAnyPermission: () => false,
		hasRole: () => false,
	}),
}));

// Scope switcher narrowed to a single branch → scopeNodeId is that node id.
// Full contract so any consumer (and the real switcher) wouldn't crash.
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

// The header renders <ScopeSwitcher/>, which consumes the FULL useScope contract.
// This test stubs only the scopeNodeId slice, so render the switcher as a no-op.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the data-fetching layer.
vi.mock("@/components/pages/commissions/payouts/AllPayoutsTable", () => ({
	AllPayoutsTable: () => <div data-testid="all-payouts-table" />,
}));
vi.mock("@/components/pages/commissions/payouts/PerRecipientPanel", () => ({
	PerRecipientPanel: () => <div data-testid="per-recipient-panel" />,
}));
vi.mock("@/features/payouts/components/run-batch-drawer", () => ({
	RunBatchDrawer: () => <div data-testid="run-batch-drawer" />,
}));

import { PayoutsTab } from "@/components/pages/commissions/payouts-tab";

describe("PayoutsTab scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve the list to a valid shape so TanStack Query never throws.
		mockClient.payouts.list.mockResolvedValue([]);
		mockClient.commissionSplits.liabilitySummary.mockResolvedValue({});
	});

	it("injects scopeNodeId as branchId on the payouts.list query", async () => {
		renderWithProviders(
			<PayoutsTab
				organizationId="org-1"
				recipientId={undefined}
				onSelectRecipient={() => {}}
			/>,
		);

		await waitFor(() =>
			expect(mockClient.payouts.list as unknown as Mock).toHaveBeenCalled(),
		);

		// orpc tanstack queryFn calls the client as (input, { signal, … }) → first
		// arg is the input. scopeNodeId is injected verbatim as `branchId`.
		expect(
			(mockClient.payouts.list as unknown as Mock).mock.calls[0]?.[0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
