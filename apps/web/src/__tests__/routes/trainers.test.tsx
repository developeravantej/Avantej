import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let TrainersViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		TrainersViewPage = opts.component;
		return {
			component: opts.component,
			useSearch: vi.fn().mockReturnValue({ tab: "trainers" }),
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
			organizations: [],
		},
		hasPermission: vi.fn().mockReturnValue(true),
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/trainers/view");
});

describe("Trainers page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.members.list.mockResolvedValue([]);
		// Queries the trainers page fires regardless of member data. The shared
		// mock-client resolves every leaf to `undefined` by default, and
		// React-Query v5 throws "Query data cannot be undefined" for those — so
		// each query must be stubbed with its real return shape.
		mockClient.trainerTiers.list.mockResolvedValue([]);
		mockClient.trainers.weeklyStatsBatch.mockResolvedValue({});
		mockClient.trainers.weeklyStats.mockResolvedValue({
			memberId: "user-1",
			sessionsThisWeek: 0,
			utilizationPct: 0,
			commissionYtd: 0,
			revenueGenerated: 0,
		});
		mockClient.trainers.weeklySchedule.mockResolvedValue({
			memberId: "user-1",
			entries: [],
		});
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<TrainersViewPage />);
		await waitFor(() => {
			expect(screen.getAllByText("Trainers").length).toBeGreaterThan(0);
		});
	});

	test("renders Add Trainer button in header", async () => {
		renderWithProviders(<TrainersViewPage />);
		await waitFor(() => {
			// The create-trainer entry point was renamed "Add Trainer" -> "Invite Trainer".
			const buttons = screen.getAllByRole("button", {
				name: /invite trainer/i,
			});
			expect(buttons.length).toBeGreaterThan(0);
		});
	});

	test("renders trainer card when data exists", async () => {
		mockClient.members.list.mockResolvedValue([
			{
				id: "member-1",
				userId: "user-1",
				role: "trainer",
				hierarchyScopeId: "node-1",
				status: "active",
				joinedAt: "2026-01-01T00:00:00.000Z",
				name: "Alice Trainer",
				email: "alice@example.com",
				trainerTierId: null,
			},
		]);

		renderWithProviders(<TrainersViewPage />);

		// "Alice Trainer" renders in two places at once: the left-hand directory
		// list row AND the auto-selected detail panel header. Scope to the list
		// row button to match the intended element (the trainer's entry in the list).
		await waitFor(() => {
			const listRow = screen.getByRole("button", { name: /alice trainer/i });
			expect(within(listRow).getByText("Alice Trainer")).toBeInTheDocument();
		});
	});
});
