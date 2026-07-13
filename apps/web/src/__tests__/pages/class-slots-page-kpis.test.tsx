import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
	}),
}));

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

vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the KPI-tile data layer.
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

describe("ClassSlotsPage KPI tiles (server-aggregated)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// list returns an EMPTY page → the client fallback would compute all zeros.
		// Any non-zero tile therefore proves the tiles read from classSlots.kpis.
		mockClient.classSlots.list.mockResolvedValue([]);
		mockClient.services.list.mockResolvedValue([]);
		mockClient.members.list.mockResolvedValue([]);
		mockClient.classSlots.kpis.mockResolvedValue({
			totalSlots: 42,
			avgFillRate: 73,
			totalWaitlisted: 9,
			projectedRevenueCents: 123_400,
		});
	});

	it("queries classSlots.kpis with the current branch scope", async () => {
		renderWithProviders(<ClassSlotsPage />);

		await waitFor(() => {
			expect(mockClient.classSlots.kpis as unknown as Mock).toHaveBeenCalled();
		});

		expect(
			(mockClient.classSlots.kpis as unknown as Mock).mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});

	it("renders the server KPI figures, not the loaded-page compute", async () => {
		const { container } = renderWithProviders(<ClassSlotsPage />);

		// Revenue string is unique → anchor on it, then assert the other tiles.
		await screen.findByText("RM 1,234.00");

		const text = container.textContent ?? "";
		expect(text).toContain("42"); // total slots
		expect(text).toContain("73"); // avg fill rate %
		expect(text).toContain("9"); // waitlisted
		// The "(loaded)" qualifier is gone now that KPIs are full-scope.
		expect(text).not.toContain("loaded");
	});
});
