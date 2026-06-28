import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so the
// expenses.list queryFn resolves back to mockClient.expenses.list with the input.
vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));

// Mutations route through useApiMutation → sonner toast on success/error.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Current org + permissions so organizationId resolves, the read-guard passes,
// and the expenses.list query enables (enabled: !!organizationId).
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: () => true,
		hasRole: () => true,
		hasAnyPermission: () => true,
	}),
}));

// ScopeProvider.useScope is the switcher context this task wires in.
// scopeNodeId is the EXACT value the page must inject as `branchId`.
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

import { ExpensesViewPage } from "@/components/pages/expenses/ExpensesViewPage";

describe("ExpensesViewPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve to a valid (non-undefined) shape so TanStack Query never throws
		// "Query data cannot be undefined".
		mockClient.expenses.list.mockResolvedValue([]);
	});

	it("injects scopeNodeId as branchId on the expenses.list query", async () => {
		renderWithProviders(<ExpensesViewPage />);

		await waitFor(() => {
			expect(mockClient.expenses.list).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) →
		// first arg is the input object.
		expect(mockClient.expenses.list.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
