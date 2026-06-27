import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so the
// services.list queryFn resolves back to mockClient.services.list with the exact
// input object. queryClient is consumed by useApiMutation (duplicate mutation).
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// Current org so organizationId resolves and the list query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
	}),
}));

// Scope narrowed to a single branch → scopeNodeId is that node id.
// Full contract so any field the page reads is present.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: "branch-x",
		isAllScope: false,
		activeScopeId: "branch-x",
		accessibleNodeIds: ["node-region-1", "branch-x"],
		scopeNodes: [],
		topAccessibleNodeId: "node-region-1",
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		isScopeReady: true,
		activeScopeNode: null,
	}),
}));

// Real switcher consumes the full useScope contract / renders a combobox → no-op.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Form/detail dialogs pull in heavy form deps and are closed on first render →
// stub them so the test stays on the data-fetching layer.
vi.mock("@/components/forms/service-form-a", () => ({
	ServiceFormDialogA: () => null,
}));
vi.mock("@/components/forms/service-detail-dialog-a", () => ({
	ServiceDetailDialogA: () => null,
}));

import { ServicesPage } from "@/components/pages/services/services-page";

describe("ServicesPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve to a valid (non-undefined) shape so TanStack Query never throws
		// "Query data cannot be undefined".
		mockClient.services.list.mockResolvedValue([]);
	});

	it("injects scopeNodeId as branchId on services.list", async () => {
		renderWithProviders(<ServicesPage />);

		await waitFor(() => {
			expect(mockClient.services.list).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) →
		// first arg is the input object.
		expect(
			(mockClient.services.list as unknown as Mock).mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
