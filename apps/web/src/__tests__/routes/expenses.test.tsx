import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";

vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: null,
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: [],
		scopeNodes: [],
		topAccessibleNodeId: null,
		isAllScope: true,
		scopeNodeId: undefined,
		isScopeReady: true,
	}),
}));
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// Capture the component passed to createFileRoute
let ExpensesViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		ExpensesViewPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: {
		invalidateQueries: () => Promise.resolve(),
		setQueryData: () => {},
		getQueryData: () => undefined,
		clear: () => {},
	},
}));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
		hasPermission: vi.fn().mockReturnValue(true),
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/expenses/view");
});

describe("Expenses page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.expenses.list.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<ExpensesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Expenses")).toBeInTheDocument();
		});
	});

	test("renders page heading and submit button", async () => {
		renderWithProviders(<ExpensesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Expenses")).toBeInTheDocument();
			expect(
				screen.getAllByRole("button", { name: /submit expense/i }).length,
			).toBeGreaterThan(0);
		});
	});

	test("renders status filter tabs", async () => {
		renderWithProviders(<ExpensesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("All")).toBeInTheDocument();
			expect(screen.getByText("Pending")).toBeInTheDocument();
			expect(screen.getByText("Approved")).toBeInTheDocument();
			expect(screen.getByText("Rejected")).toBeInTheDocument();
			expect(screen.getByText("Paid")).toBeInTheDocument();
		});
	});

	test("renders expenses in table when data exists", async () => {
		mockClient.expenses.list.mockResolvedValue([
			{
				id: "exp-1",
				category: "travel",
				description: "Flight to KL",
				amount: 15000,
				status: "pending",
				expenseDate: "2026-02-01T00:00:00.000Z",
				submittedBy: "member-1",
				createdAt: "2026-02-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<ExpensesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Flight to KL")).toBeInTheDocument();
		});
	});

	test("displays pending expense with Approve and Reject action buttons", async () => {
		mockClient.expenses.list.mockResolvedValue([
			{
				id: "exp-1",
				category: "travel",
				description: "Taxi fare",
				amount: 5000,
				status: "pending",
				expenseDate: "2026-02-01T00:00:00.000Z",
				submittedBy: "member-1",
				createdAt: "2026-02-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<ExpensesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Taxi fare")).toBeInTheDocument();
			// Use exact text match to avoid matching the "Approved" filter tab
			expect(screen.getByText("Approve")).toBeInTheDocument();
			expect(screen.getByText("Reject")).toBeInTheDocument();
		});
	});
});
