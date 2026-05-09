import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

import { TrainerTiersPage } from "@/components/pages/trainers/trainer-tiers-page";

describe("TrainerTiersPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.trainerTiers.list.mockResolvedValue([]);
		mockClient.trainerTiers.create.mockResolvedValue({});
		mockClient.trainerTiers.deactivate.mockResolvedValue({});
		mockClient.trainerTiers.reactivate.mockResolvedValue({});
	});

	it("renders the tiers table with 2 tiers", async () => {
		mockClient.trainerTiers.list.mockResolvedValue([
			{ id: "tier-1", name: "Junior Trainer", rank: 1, isActive: true },
			{ id: "tier-2", name: "Senior Trainer", rank: 2, isActive: true },
		]);

		renderWithProviders(<TrainerTiersPage />);

		await waitFor(() => {
			expect(screen.getByText("Junior Trainer")).toBeInTheDocument();
			expect(screen.getByText("Senior Trainer")).toBeInTheDocument();
		});

		// Table headers
		expect(screen.getByText("Name")).toBeInTheDocument();
		expect(screen.getByText("Rank")).toBeInTheDocument();
		expect(screen.getByText("Status")).toBeInTheDocument();
		expect(screen.getByText("Actions")).toBeInTheDocument();
	});

	it("shows empty state when list is empty", async () => {
		mockClient.trainerTiers.list.mockResolvedValue([]);

		renderWithProviders(<TrainerTiersPage />);

		await waitFor(() => {
			expect(
				screen.getByText(/No tiers yet/i),
			).toBeInTheDocument();
		});
	});

	it("New Tier button opens create dialog with name, rank, and description fields", async () => {
		const user = userEvent.setup();
		renderWithProviders(<TrainerTiersPage />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /new tier/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /new tier/i }));

		await waitFor(() => {
			// Dialog title is a heading element (h2)
			expect(screen.getByRole("heading", { name: "New Tier" })).toBeInTheDocument();
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/rank/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
		});
	});

	it("submitting the create form calls trainerTiers.create with correct payload", async () => {
		const user = userEvent.setup();
		mockClient.trainerTiers.list.mockResolvedValue([]);
		mockClient.trainerTiers.create.mockResolvedValue({});

		renderWithProviders(<TrainerTiersPage />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /new tier/i })).toBeInTheDocument();
		});

		// Open dialog
		await user.click(screen.getByRole("button", { name: /new tier/i }));

		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});

		// Fill in the form
		await user.clear(screen.getByLabelText(/name/i));
		await user.type(screen.getByLabelText(/name/i), "Gold Trainer");

		// Set rank — clear then type
		const rankInput = screen.getByLabelText(/rank/i);
		await user.clear(rankInput);
		await user.type(rankInput, "3");

		await user.type(screen.getByLabelText(/description/i), "Top tier");

		// Submit
		await user.click(screen.getByRole("button", { name: /create tier/i }));

		await waitFor(() => {
			expect(mockClient.trainerTiers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
					name: "Gold Trainer",
					rank: 3,
					description: "Top tier",
				}),
			);
		});
	});

	it("Deactivate button triggers confirmation dialog and calls trainerTiers.deactivate with tier id", async () => {
		const user = userEvent.setup();
		mockClient.trainerTiers.list.mockResolvedValue([
			{ id: "tier-1", name: "Junior Trainer", rank: 1, isActive: true },
		]);
		mockClient.trainerTiers.deactivate.mockResolvedValue({});

		renderWithProviders(<TrainerTiersPage />);

		await waitFor(() => {
			expect(screen.getByText("Junior Trainer")).toBeInTheDocument();
		});

		// Click Deactivate on the tier row
		await user.click(screen.getByRole("button", { name: /deactivate/i }));

		// Confirmation dialog appears
		await waitFor(() => {
			expect(screen.getByText("Deactivate Tier")).toBeInTheDocument();
		});

		// Confirm deactivation — there are now two "Deactivate" buttons (the row one is gone, confirm one is present)
		const confirmBtn = screen.getByRole("button", { name: /^deactivate$/i });
		await user.click(confirmBtn);

		await waitFor(() => {
			expect(mockClient.trainerTiers.deactivate).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
					id: "tier-1",
				}),
			);
		});
	});

	it("shows missing-rate banner when create returns missingRateCategories with items", async () => {
		const user = userEvent.setup();
		mockClient.trainerTiers.list.mockResolvedValue([]);
		mockClient.trainerTiers.create.mockResolvedValue({
			id: "tier-new",
			missingRateCategories: [
				{ categoryId: "cat-abc", configId: "cfg-1" },
				{ categoryId: "cat-def", configId: "cfg-2" },
			],
		});

		renderWithProviders(<TrainerTiersPage />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /new tier/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /new tier/i }));

		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});

		await user.type(screen.getByLabelText(/name/i), "Elite Trainer");
		await user.click(screen.getByRole("button", { name: /create tier/i }));

		await waitFor(() => {
			expect(
				screen.getByText(/don't have a commission rate for this tier/i),
			).toBeInTheDocument();
			expect(screen.getByText("cat-abc")).toBeInTheDocument();
			expect(screen.getByText("cat-def")).toBeInTheDocument();
		});
	});
});
