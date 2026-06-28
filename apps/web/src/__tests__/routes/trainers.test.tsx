import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

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
vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
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
// useTrainerData reads useScope and the page renders <ScopeSwitcher/>; mock both
// so the page mounts without a ScopeProvider in the tree.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: undefined,
		isAllScope: true,
		activeScopeId: null,
		accessibleNodeIds: [],
		scopeNodes: [],
		topAccessibleNodeId: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		isScopeReady: true,
		activeScopeNode: null,
	}),
}));
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/trainers/view");
});

describe("Trainers page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.members.list.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<TrainersViewPage />);
		await waitFor(() => {
			expect(screen.getAllByText("Trainers").length).toBeGreaterThan(0);
		});
	});

	test("renders Invite Trainer button in header", async () => {
		renderWithProviders(<TrainersViewPage />);
		await waitFor(() => {
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

		await waitFor(() => {
			expect(screen.getAllByText("Alice Trainer").length).toBeGreaterThan(0);
		});
	});
});
