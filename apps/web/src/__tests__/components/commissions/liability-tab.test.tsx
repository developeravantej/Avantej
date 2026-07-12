import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";

const { invalidateQueries, toastSuccess, toastError } = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries },
}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError },
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Org",
					hierarchy: {
						nodes: [{ id: "branch-1", name: "Main Branch", type: "branch" }],
						member: { accessibleNodeIds: ["branch-1"] },
					},
				},
			],
		},
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));

import { LiabilityTab } from "@/components/pages/commissions/liability-tab";

// ---------------------------------------------------------------------------
// Fixtures — all money values are INTEGER CENTS.
// ---------------------------------------------------------------------------

const trainerA = {
	memberId: "user-a",
	name: "Ahmad Firdaus",
	currency: "MYR",
	approvedUnpaidCents: 25000,
	paidCents: 10000,
	manualAdjustmentCents: 0,
	netPayableCents: 25000,
	byRoleType: { trainer: 25000 },
};

const trainerB = {
	memberId: "user-b",
	name: "Siti Nurhaliza",
	currency: "MYR",
	approvedUnpaidCents: 12345,
	paidCents: 0,
	manualAdjustmentCents: -500,
	netPayableCents: 11845,
	byRoleType: { sales: 12345 },
};

const totals = {
	approvedUnpaidCents: 37345,
	paidCents: 10000,
	manualAdjustmentCents: -500,
	netPayableCents: 36845,
	byRoleType: { trainer: 25000, sales: 12345 },
};

const summary = {
	trainers: [trainerA, trainerB],
	totals,
	totalsByCurrency: { MYR: totals },
};

beforeEach(() => {
	vi.clearAllMocks();
	mockClient.commissionSplits.liabilitySummary.mockResolvedValue(summary);
	mockClient.serviceCategories.list.mockResolvedValue([]);
	// jsdom has no createObjectURL — shim for the CSV download path.
	globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
	globalThis.URL.revokeObjectURL = vi.fn();
});

// ---------------------------------------------------------------------------
// Export CSV (liability-tab.tsx handleExportCsv → exportLiabilityCsv)
// ---------------------------------------------------------------------------

describe("LiabilityTab — export CSV", () => {
	it("calls commissionSplits.exportLiabilityCsv with the active filters", async () => {
		mockClient.commissionSplits.exportLiabilityCsv.mockResolvedValue({
			csv: "Staff Member,Net Payable (RM)\nAhmad,250.00",
			rowCount: 1,
		});

		renderWithProviders(<LiabilityTab />);

		const exportBtn = await screen.findByRole("button", {
			name: /Export CSV/i,
		});
		await waitFor(() => expect(exportBtn).not.toBeDisabled());
		fireEvent.click(exportBtn);

		await waitFor(() =>
			expect(
				mockClient.commissionSplits.exportLiabilityCsv,
			).toHaveBeenCalledTimes(1),
		);
		const arg = mockClient.commissionSplits.exportLiabilityCsv.mock.calls[0][0];
		expect(arg.organizationId).toBe("org-1");
		// Date range is sent as ISO datetimes derived from the pickers.
		expect(typeof arg.from).toBe("string");
		expect(typeof arg.to).toBe("string");
		expect(new Date(arg.from).getTime()).not.toBeNaN();
		expect(new Date(arg.to).getTime()).not.toBeNaN();
		// No filters selected → undefined, not empty strings.
		expect(arg.hierarchyNodeId).toBeUndefined();
		expect(arg.categoryId).toBeUndefined();
		expect(arg.trackId).toBeUndefined();
		expect(arg.roleType).toBeUndefined();
		// The CSV blob was actually downloaded.
		expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
	});

	it("disables Export CSV when there are no liability rows", async () => {
		mockClient.commissionSplits.liabilitySummary.mockResolvedValue({
			trainers: [],
			totals: {
				approvedUnpaidCents: 0,
				paidCents: 0,
				manualAdjustmentCents: 0,
				netPayableCents: 0,
				byRoleType: {},
			},
			totalsByCurrency: {},
		});

		renderWithProviders(<LiabilityTab />);

		const exportBtn = await screen.findByRole("button", {
			name: /Export CSV/i,
		});
		expect(exportBtn).toBeDisabled();
		fireEvent.click(exportBtn);
		expect(
			mockClient.commissionSplits.exportLiabilityCsv,
		).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Mark as Paid batch (liability-tab.tsx markPaidBatch)
// ---------------------------------------------------------------------------

describe("LiabilityTab — mark paid batch", () => {
	it("guards against empty selection: footer button disabled, no mutation", async () => {
		renderWithProviders(<LiabilityTab />);

		const markPaidBtn = await screen.findByRole("button", {
			name: /Mark as Paid/i,
		});
		expect(markPaidBtn).toBeDisabled();
		fireEvent.click(markPaidBtn);
		expect(mockClient.commissionSplits.markPaidBatch).not.toHaveBeenCalled();
	});

	it("sends exactly the selected memberIds (integer-cent rows) to markPaidBatch", async () => {
		mockClient.commissionSplits.markPaidBatch.mockResolvedValue({
			updatedCount: 3,
		});

		renderWithProviders(<LiabilityTab />);

		// Select only trainer A via its row checkbox.
		const checkbox = await screen.findByLabelText("Select Ahmad Firdaus");
		fireEvent.click(checkbox);

		const markPaidBtn = screen.getByRole("button", {
			name: /Mark as Paid/i,
		});
		expect(markPaidBtn).not.toBeDisabled();
		fireEvent.click(markPaidBtn);

		// Confirmation dialog opens; confirm it.
		const confirm = await screen.findByRole("button", { name: "Confirm" });
		fireEvent.click(confirm);

		await waitFor(() =>
			expect(mockClient.commissionSplits.markPaidBatch).toHaveBeenCalledTimes(
				1,
			),
		);
		const arg = mockClient.commissionSplits.markPaidBatch.mock.calls[0][0];
		expect(arg.organizationId).toBe("org-1");
		expect(arg.memberIds).toEqual(["user-a"]);
		expect(typeof arg.from).toBe("string");
		expect(typeof arg.to).toBe("string");
	});

	it("select-all sends every visible memberId", async () => {
		mockClient.commissionSplits.markPaidBatch.mockResolvedValue({
			updatedCount: 2,
		});

		renderWithProviders(<LiabilityTab />);

		const selectAll = await screen.findByLabelText("Select all staff");
		fireEvent.click(selectAll);

		fireEvent.click(screen.getByRole("button", { name: /Mark as Paid/i }));
		fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

		await waitFor(() =>
			expect(mockClient.commissionSplits.markPaidBatch).toHaveBeenCalledTimes(
				1,
			),
		);
		const arg = mockClient.commissionSplits.markPaidBatch.mock.calls[0][0];
		// Rows are sorted by netPayableCents desc → A (25000) then B (11845).
		expect([...arg.memberIds].sort()).toEqual(["user-a", "user-b"]);
	});

	it("invalidates liability + ledger + payouts queries and clears selection on success", async () => {
		mockClient.commissionSplits.markPaidBatch.mockResolvedValue({
			updatedCount: 1,
		});

		renderWithProviders(<LiabilityTab />);

		fireEvent.click(await screen.findByLabelText("Select Ahmad Firdaus"));
		fireEvent.click(screen.getByRole("button", { name: /Mark as Paid/i }));
		fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith(
				"Marked 1 commission split as paid.",
			),
		);
		const keys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
		expect(keys).toContainEqual(
			mockOrpc.commissionSplits.liabilitySummary.key(),
		);
		expect(keys).toContainEqual(mockOrpc.commissionSplits.listLedger.key());
		expect(keys).toContainEqual(
			mockOrpc.commissionSplits.getMyCommissions.key(),
		);
		// F-PAY-1: the payouts tab list refreshes too.
		expect(keys).toContainEqual([["payouts", "list"]]);
		// Selection cleared → button back to disabled.
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /Mark as Paid/i }),
			).toBeDisabled(),
		);
	});
});

// ---------------------------------------------------------------------------
// Money rendering sanity — cents in, RM strings out
// ---------------------------------------------------------------------------

describe("LiabilityTab — cent-denominated rendering", () => {
	it("renders integer cents through formatPrice (RM x.xx)", async () => {
		renderWithProviders(<LiabilityTab />);

		// 25000 cents → RM 250.00 (row + KPI band may both show it).
		await waitFor(() =>
			expect(screen.getAllByText("RM 250.00").length).toBeGreaterThan(0),
		);
		// 11845 cents → RM 118.45 (net payable of trainer B).
		expect(screen.getAllByText("RM 118.45").length).toBeGreaterThan(0);
	});
});
