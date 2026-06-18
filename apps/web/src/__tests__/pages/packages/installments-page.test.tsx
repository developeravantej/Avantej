import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));
// refunds dialog has its own network calls — stub it out
vi.mock("@/components/refunds/request-refund-dialog", () => ({
	RequestRefundDialog: () => null,
}));

import { PackageInstallmentsPage } from "@/components/pages/packages/installments-page";

describe("PackageInstallmentsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.installments.adminOverview.mockResolvedValue({
			items: [],
			total: 0,
		});
		mockClient.installments.listByPackageInstance.mockResolvedValue([]);
		mockClient.installments.setOverdraft.mockResolvedValue({});
		mockClient.installmentPlans.list.mockResolvedValue([]);
	});

	it("renders the status tabs including Due Soon", async () => {
		renderWithProviders(<PackageInstallmentsPage />);

		// All standard tabs should be visible
		expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Due Soon" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Overdue" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Locked" })).toBeInTheDocument();
	});

	it("clicking the Due Soon tab calls adminOverview with status: due_soon", async () => {
		const user = userEvent.setup();
		renderWithProviders(<PackageInstallmentsPage />);

		const dueSoonTab = screen.getByRole("button", { name: "Due Soon" });
		await user.click(dueSoonTab);

		await waitFor(() => {
			expect(mockClient.installments.adminOverview).toHaveBeenCalledWith(
				expect.objectContaining({ status: "due_soon" }),
			);
		});
	});

	it("shows the Next Amount column header when Due Soon tab is active", async () => {
		const user = userEvent.setup();
		renderWithProviders(<PackageInstallmentsPage />);

		// Column should not be visible on default (All) tab
		expect(screen.queryByText("Next Amount")).not.toBeInTheDocument();

		const dueSoonTab = screen.getByRole("button", { name: "Due Soon" });
		await user.click(dueSoonTab);

		expect(screen.getByText("Next Amount")).toBeInTheDocument();
	});

	it("displays nextInstallmentAmount in the row when present under Due Soon tab", async () => {
		const user = userEvent.setup();

		mockClient.installments.adminOverview.mockResolvedValue({
			items: [
				{
					id: "pi-1",
					clientId: "client-1",
					clientName: "Alice",
					paymentPlanType: "monthly",
					creditsUnlocked: 4,
					creditsTotal: 12,
					creditsUsed: 1,
					creditsRemaining: 3,
					installmentsPaid: 1,
					installmentsTotal: 12,
					nextDueDate: "2026-05-01T00:00:00.000Z",
					gracePeriodEndsAt: null,
					isLocked: false,
					lockedReason: null,
					nextInstallmentAmount: 50000,
					nextInstallmentId: "inst-2",
				},
			],
			total: 1,
		});

		renderWithProviders(<PackageInstallmentsPage />);

		const dueSoonTab = screen.getByRole("button", { name: "Due Soon" });
		await user.click(dueSoonTab);

		await waitFor(() => {
			// formatPrice(50000, "MYR") renders the price
			expect(screen.getByText(/RM/)).toBeInTheDocument();
		});
	});

	it("opens the Allow Overdraft dialog, fills reason, submits, and calls setOverdraft with correct args", async () => {
		const user = userEvent.setup({ delay: null });
		const organizationId = "996febce-aaad-4ded-8f47-02d2b566c8ee";

		mockClient.installments.adminOverview.mockResolvedValue({
			items: [
				{
					id: "pi-locked-1",
					clientId: "client-3",
					clientName: "Carol",
					paymentPlanType: "monthly",
					creditsUnlocked: 0,
					creditsTotal: 12,
					creditsUsed: 0,
					creditsRemaining: 0,
					installmentsPaid: 0,
					installmentsTotal: 12,
					nextDueDate: "2026-05-01T00:00:00.000Z",
					gracePeriodEndsAt: null,
					isLocked: true,
					lockedReason: "Missed payment",
					allowCreditOverdraft: false,
					nextInstallmentAmount: null,
					nextInstallmentId: null,
				},
			],
			total: 1,
		});
		mockClient.installments.listByPackageInstance.mockResolvedValue([]);

		renderWithProviders(<PackageInstallmentsPage />);

		// Wait for the row to appear and click it to open the sheet
		const row = await screen.findByText("Carol");
		await user.click(row);

		// The sheet should be open — find and click the "Allow Overdraft" button
		const allowOverdraftBtn = await screen.findByRole("button", {
			name: "Allow Overdraft",
		});
		await user.click(allowOverdraftBtn);

		// The dialog should appear with a reason textarea
		const reasonTextarea = await screen.findByRole("textbox", {
			name: /reason/i,
		});
		await user.type(reasonTextarea, "VIP customer — payment delayed by 3 days");

		// Submit button should now be enabled
		const confirmBtn = screen.getByRole("button", { name: "Confirm" });
		expect(confirmBtn).not.toBeDisabled();
		await user.click(confirmBtn);

		await waitFor(() => {
			expect(mockClient.installments.setOverdraft).toHaveBeenCalledWith({
				organizationId,
				packageInstanceId: "pi-locked-1",
				enabled: true,
				reason: "VIP customer — payment delayed by 3 days",
			});
		});
	}, 15000);

	it("shows em-dash when nextInstallmentAmount is null under Due Soon tab", async () => {
		const user = userEvent.setup();

		mockClient.installments.adminOverview.mockResolvedValue({
			items: [
				{
					id: "pi-2",
					clientId: "client-2",
					clientName: "Bob",
					paymentPlanType: "monthly",
					creditsUnlocked: 4,
					creditsTotal: 12,
					creditsUsed: 1,
					creditsRemaining: 3,
					installmentsPaid: 1,
					installmentsTotal: 12,
					nextDueDate: "2026-05-03T00:00:00.000Z",
					gracePeriodEndsAt: null,
					isLocked: false,
					lockedReason: null,
					nextInstallmentAmount: null,
					nextInstallmentId: null,
				},
			],
			total: 1,
		});

		renderWithProviders(<PackageInstallmentsPage />);

		const dueSoonTab = screen.getByRole("button", { name: "Due Soon" });
		await user.click(dueSoonTab);

		await waitFor(() => {
			// Em-dash for null amount
			expect(screen.getAllByText("—").length).toBeGreaterThan(0);
		});
	});
});
