import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let StockRequestsViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		StockRequestsViewPage = opts.component;
		return {
			component: opts.component,
			useSearch: vi.fn().mockReturnValue({ tab: "requests" }),
			useNavigate: vi.fn().mockReturnValue(vi.fn()),
		};
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
			user: { id: "member-1" },
		},
		hasPermission: vi.fn().mockReturnValue(true),
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/stock-requests/view"
	);
});

describe("Stock Requests page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.stockRequests.list.mockResolvedValue([]);
		mockClient.stockRequests.create.mockResolvedValue({ id: "sr-1" });
		mockClient.stockRequests.approve.mockResolvedValue({});
		mockClient.stockRequests.reject.mockResolvedValue({});
		mockClient.stockRequests.fulfill.mockResolvedValue({});
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<StockRequestsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Stock Requests")).toBeInTheDocument();
		});
	});

	test("calls client.stockRequests.list on mount", async () => {
		renderWithProviders(<StockRequestsViewPage />);

		await waitFor(() => {
			expect(mockClient.stockRequests.list).toHaveBeenCalled();
		});
	});

	test("shows stock request data in the table", async () => {
		mockClient.stockRequests.list.mockResolvedValue([
			{
				id: "sr1",
				requestNumber: "SR-001",
				status: "pending",
				fromBranchId: null,
				toBranchId: "branch-1",
				destinationLabel: null,
				dateIssued: new Date(),
				issuedByMemberId: "m1",
				notes: null,
				items: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<StockRequestsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("SR-001")).toBeInTheDocument();
		});
	});

	test("shows pending status badge for pending stock request", async () => {
		mockClient.stockRequests.list.mockResolvedValue([
			{
				id: "sr1",
				requestNumber: "SR-001",
				status: "pending",
				fromBranchId: null,
				toBranchId: "branch-1",
				destinationLabel: null,
				dateIssued: new Date(),
				issuedByMemberId: "m1",
				notes: null,
				items: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<StockRequestsViewPage />);

		await waitFor(() => {
			// Both the filter tab and the status badge say "Pending"
			expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(2);
		});
	});
});
