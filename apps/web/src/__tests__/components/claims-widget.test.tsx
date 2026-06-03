import { describe, test, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";
import { ClaimsWidget } from "@/components/claims-widget";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
	}),
}));
vi.mock("@/lib/currency", () => ({
	formatPrice: (amount: number, _currency: string) =>
		`RM ${(amount / 100).toFixed(2)}`,
}));

describe("ClaimsWidget", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("renders 'Claims' heading", async () => {
		mockClient.expenses.list.mockResolvedValueOnce([]);
		renderWithProviders(<ClaimsWidget />);

		await waitFor(() => {
			expect(screen.getByText("Claims")).toBeInTheDocument();
		});
	});

	test("calls expenses.list with status: 'pending'", async () => {
		mockClient.expenses.list.mockResolvedValueOnce([]);
		renderWithProviders(<ClaimsWidget />);

		await waitFor(() => {
			expect(mockClient.expenses.list).toHaveBeenCalledWith(
				expect.objectContaining({ status: "pending" }),
				expect.anything(),
			);
		});
	});

	test("renders empty state when no pending expenses", async () => {
		mockClient.expenses.list.mockResolvedValueOnce([]);
		renderWithProviders(<ClaimsWidget />);

		await waitFor(() => {
			expect(screen.getByText("No pending claims")).toBeInTheDocument();
		});
	});

	test("renders pending expenses list", async () => {
		mockClient.expenses.list.mockResolvedValueOnce([
			{
				id: "exp-1",
				category: "travel",
				description: "Business trip to KL",
				amount: 15000,
				status: "pending",
			},
			{
				id: "exp-2",
				category: "equipment",
				description: "New laptop",
				amount: 300000,
				status: "pending",
			},
		]);

		renderWithProviders(<ClaimsWidget />);

		await waitFor(() => {
			expect(screen.getByText("Business trip to KL")).toBeInTheDocument();
			expect(screen.getByText("New laptop")).toBeInTheDocument();
		});
	});

	test("displays expense category as badge", async () => {
		mockClient.expenses.list.mockResolvedValueOnce([
			{
				id: "exp-1",
				category: "travel",
				description: "Flight",
				amount: 5000,
				status: "pending",
			},
		]);

		renderWithProviders(<ClaimsWidget />);

		await waitFor(() => {
			expect(screen.getByText("travel")).toBeInTheDocument();
		});
	});

	test("renders loading state", () => {
		mockClient.expenses.list.mockReturnValueOnce(new Promise(() => {}));
		renderWithProviders(<ClaimsWidget />);

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});
});
