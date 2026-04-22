import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";
import { CategoryCommissionForm } from "@/components/forms/category-commission-form";

vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

const DEFAULT_PROPS = {
	categoryId: "cat-1",
	categoryName: "Personal Training",
	organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
	onOpenChange: vi.fn(),
};

// A minimal valid existingConfig shape that the component destructures
const EXISTING_CONFIG = {
	config: {
		paymentType: "fixed",
		isConditional: false,
		maxCoaches: 1,
	},
	slots: [
		{ slotIndex: 0, label: "Head Coach", weightageBasisPoints: 10000 },
	],
	rates: [
		{ trainerTierId: "tier-a", amount: 5000 },
	],
	conditions: [],
};

describe("CategoryCommissionForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: no config, no tiers
		mockClient.categoryCommission.getByCategory.mockResolvedValue(null);
		mockClient.trainerTiers.list.mockResolvedValue([]);
		mockClient.categoryCommission.upsert.mockResolvedValue({});
	});

	it("does not show commission config content when closed", () => {
		renderWithProviders(<CategoryCommissionForm {...DEFAULT_PROPS} open={false} />);

		// Sheet is closed — content is not rendered
		expect(screen.queryByText("Commission Config")).not.toBeInTheDocument();
		expect(screen.queryByText("Payment Type")).not.toBeInTheDocument();
		expect(screen.queryByText("Save Config")).not.toBeInTheDocument();
	});

	it("shows payment type options (Fixed RM / Variable %) when open", async () => {
		renderWithProviders(<CategoryCommissionForm {...DEFAULT_PROPS} open={true} />);

		await waitFor(() => {
			expect(screen.getByText("Fixed RM")).toBeInTheDocument();
			expect(screen.getByText("Variable %")).toBeInTheDocument();
		});
	});

	it("shows 'No config yet' badge when getByCategory returns null/undefined", async () => {
		mockClient.categoryCommission.getByCategory.mockResolvedValue(null);

		renderWithProviders(<CategoryCommissionForm {...DEFAULT_PROPS} open={true} />);

		await waitFor(() => {
			expect(screen.getByText("No config yet")).toBeInTheDocument();
		});
	});

	it("shows 'Configured' badge when getByCategory returns an existing config", async () => {
		mockClient.categoryCommission.getByCategory.mockResolvedValue(EXISTING_CONFIG);

		renderWithProviders(<CategoryCommissionForm {...DEFAULT_PROPS} open={true} />);

		await waitFor(() => {
			expect(screen.getByText("Configured")).toBeInTheDocument();
		});
	});

	it("selecting Variable % changes the unit label from RM to %", async () => {
		const user = userEvent.setup();
		// Need at least one tier so the unit label renders
		mockClient.trainerTiers.list.mockResolvedValue([
			{ id: "tier-a", name: "Junior", rank: 1, isActive: true },
		]);
		mockClient.categoryCommission.getByCategory.mockResolvedValue(null);

		renderWithProviders(<CategoryCommissionForm {...DEFAULT_PROPS} open={true} />);

		// Wait for tiers section to load
		await waitFor(() => {
			expect(screen.getByText("Junior")).toBeInTheDocument();
		});

		// Initially shows "RM" unit label next to the rate input
		const rmLabels = screen.getAllByText("RM");
		expect(rmLabels.length).toBeGreaterThan(0);

		// Click the "Variable %" option — the radio button id is "pt-variable"
		const variableOption = screen.getByRole("radio", { name: /variable/i });
		await user.click(variableOption);

		await waitFor(() => {
			// RM labels should be gone, % labels should appear
			expect(screen.queryByText("RM")).not.toBeInTheDocument();
			// The "%" label next to the rate input (distinct from the slot % suffix)
			const percentLabels = screen.getAllByText("%");
			// At least one standalone "%" is the unit label for rates
			expect(percentLabels.length).toBeGreaterThan(0);
		});
	});

	it("Save Config calls categoryCommission.upsert with correct payload", async () => {
		const user = userEvent.setup();
		// One tier so rates array is populated
		mockClient.trainerTiers.list.mockResolvedValue([
			{ id: "tier-a", name: "Junior", rank: 1, isActive: true },
		]);
		mockClient.categoryCommission.getByCategory.mockResolvedValue(null);
		mockClient.categoryCommission.upsert.mockResolvedValue({});

		renderWithProviders(<CategoryCommissionForm {...DEFAULT_PROPS} open={true} />);

		// Wait for form to fully render (tiers loaded)
		await waitFor(() => {
			expect(screen.getByText("Junior")).toBeInTheDocument();
		});

		// Default slot weightage is 100%, so save should work
		const saveBtn = screen.getByRole("button", { name: /save config/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(mockClient.categoryCommission.upsert).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
					categoryId: "cat-1",
					paymentType: "fixed",
					isConditional: false,
				}),
			);
		});
	});

	it("shows toast error when slot weightages don't sum to 100%", async () => {
		const user = userEvent.setup();
		const { toast } = await import("sonner");

		mockClient.categoryCommission.getByCategory.mockResolvedValue(null);
		mockClient.trainerTiers.list.mockResolvedValue([]);

		renderWithProviders(<CategoryCommissionForm {...DEFAULT_PROPS} open={true} />);

		await waitFor(() => {
			expect(screen.getByText("Coach Slots")).toBeInTheDocument();
		});

		// The slot weightage input — default is 100.00%, change to 50 to break the sum
		const weightageInputs = screen.getAllByDisplayValue("100.00");
		expect(weightageInputs.length).toBeGreaterThan(0);

		await user.clear(weightageInputs[0]);
		await user.type(weightageInputs[0], "50");

		// Attempt to save — weightage is now 50%, not 100%
		const saveBtn = screen.getByRole("button", { name: /save config/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				expect.stringMatching(/slot weightages must total 100%/i),
			);
		});

		// upsert should NOT have been called
		expect(mockClient.categoryCommission.upsert).not.toHaveBeenCalled();
	});
});
