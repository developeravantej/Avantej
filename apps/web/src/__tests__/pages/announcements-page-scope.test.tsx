import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Current org so organizationId resolves and the scoped query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
	}),
}));

// Scope narrowed to a single branch → scopeNodeId is that node id, which the
// page must inject as `branchId` on announcements.list.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: "branch-x",
		isAllScope: false,
		activeScopeId: "branch-x",
		accessibleNodeIds: ["branch-x"],
		scopeNodes: [],
		topAccessibleNodeId: "branch-x",
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		isScopeReady: true,
		activeScopeNode: null,
	}),
}));

// The header renders <ScopeSwitcher/>, which consumes the FULL useScope
// contract. This test stubs only the scopeNodeId slice, so render the switcher
// as a no-op — its own rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the data-fetching layer
// (and avoid dialog/portal noise from the form + confirmation dialogs).
vi.mock("@/components/pages/announcements/AnnouncementsFilterRail", () => ({
	AnnouncementsFilterRail: () => <div data-testid="filter-rail" />,
}));
vi.mock("@/components/pages/announcements/AnnouncementListItem", () => ({
	AnnouncementListItem: () => <div data-testid="list-item" />,
}));
vi.mock("@/components/pages/announcements/AnnouncementsEmptyState", () => ({
	AnnouncementsEmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock("@/components/pages/announcements/AnnouncementFormDialog", () => ({
	AnnouncementFormDialog: () => <div data-testid="form-dialog" />,
}));
vi.mock("@/components/pages/announcements/AnnouncementDeleteDialog", () => ({
	AnnouncementDeleteDialog: () => <div data-testid="delete-dialog" />,
}));
vi.mock(
	"@/components/pages/announcements/AnnouncementDeactivateDialog",
	() => ({
		AnnouncementDeactivateDialog: () => <div data-testid="deactivate-dialog" />,
	}),
);

import { AnnouncementsViewPage } from "@/components/pages/announcements/AnnouncementsViewPage";

describe("AnnouncementsViewPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve queries to valid (non-undefined) shapes so TanStack Query never
		// throws "Query data cannot be undefined".
		mockClient.announcements.list.mockResolvedValue([]);
		mockClient.hierarchy.listNodes.mockResolvedValue({ nodes: [] });
	});

	it("injects scopeNodeId as branchId on the announcements.list query", async () => {
		renderWithProviders(<AnnouncementsViewPage />);

		await waitFor(() => {
			expect(mockClient.announcements.list).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → first arg is the input.
		expect(mockClient.announcements.list.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
