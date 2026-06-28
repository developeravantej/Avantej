import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
// `queryClient` is imported by useApiMutation (only used inside onSuccess) — stub it.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Current org so organizationId resolves and the scoped query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
	}),
}));

// Scope narrowed to a single branch → scopeNodeId is the EXACT value the page
// must inject as `branchId` on classSlots.list. Full contract so nothing the
// page (or a stray consumer) reads is undefined.
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

// The header renders <ScopeSwitcher/>, which consumes the FULL useScope contract.
// This test stubs only the scopeNodeId slice → render the switcher as a no-op
// (its own rendering is covered by the ScopeSwitcher tests).
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the data-fetching layer
// and avoid Radix Sheet/Dialog portal noise in jsdom.
vi.mock("@/components/pages/class-slots/ClassSlotsTable", () => ({
	ClassSlotsTable: () => <div data-testid="class-slots-table" />,
}));
vi.mock("@/components/pages/class-slots/CreateClassSlotDialog", () => ({
	CreateClassSlotDialog: () => null,
}));
vi.mock("@/components/pages/class-slots/EditClassSlotDialog", () => ({
	EditClassSlotDialog: () => null,
}));
vi.mock("@/components/pages/class-slots/SignupsDialog", () => ({
	SignupsDialog: () => null,
}));
vi.mock("@/components/pages/class-slots/CancelClassSlotDialog", () => ({
	CancelClassSlotDialog: () => null,
}));

import { ClassSlotsPage } from "@/components/pages/class-slots/class-slots-page";

describe("ClassSlotsPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve to valid (non-undefined) shapes so TanStack Query never throws
		// "Query data cannot be undefined".
		mockClient.classSlots.list.mockResolvedValue([]);
		mockClient.services.list.mockResolvedValue([]);
		mockClient.members.list.mockResolvedValue([]);
	});

	it("injects scopeNodeId as branchId on the classSlots.list query", async () => {
		renderWithProviders(<ClassSlotsPage />);

		await waitFor(() => {
			expect(mockClient.classSlots.list as unknown as Mock).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → first arg is the input.
		expect(
			(mockClient.classSlots.list as unknown as Mock).mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
