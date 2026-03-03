import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let TransferOrdersViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		TransferOrdersViewPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
			user: { id: "member-1" },
		},
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/transfer-orders/view"
	);
});

describe("Transfer Orders page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.transferOrders.list.mockResolvedValue([]);
		mockClient.transferOrders.create.mockResolvedValue({ id: "to-1" });
		mockClient.transferOrders.markInTransit.mockResolvedValue({});
		mockClient.transferOrders.complete.mockResolvedValue({});
		mockClient.transferOrders.cancel.mockResolvedValue({});
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<TransferOrdersViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Transfer Orders")).toBeInTheDocument();
		});
	});

	test("calls client.transferOrders.list on mount", async () => {
		renderWithProviders(<TransferOrdersViewPage />);

		await waitFor(() => {
			expect(mockClient.transferOrders.list).toHaveBeenCalled();
		});
	});

	test("shows transfer order data in the table", async () => {
		mockClient.transferOrders.list.mockResolvedValue([
			{
				id: "to1",
				transferNumber: "TO-001",
				status: "pending",
				fromBranchId: "b1",
				toBranchId: "b2",
				dateIssued: new Date(),
				issuedByMemberId: "m1",
				completedAt: null,
				notes: null,
				items: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<TransferOrdersViewPage />);

		await waitFor(() => {
			expect(screen.getByText("TO-001")).toBeInTheDocument();
		});
	});

	test("renders New Transfer button", async () => {
		renderWithProviders(<TransferOrdersViewPage />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /new transfer/i }),
			).toBeInTheDocument();
		});
	});
});
