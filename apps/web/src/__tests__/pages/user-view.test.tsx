import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let UserViewPage: React.ComponentType;

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		UserViewPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: {},
	queryClient: { invalidateQueries: () => Promise.resolve(), setQueryData: () => {}, getQueryData: () => undefined, clear: () => {} },
}));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1" },
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: (roles: string[]) => roles.includes("admin"),
	}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Stub heavy child components
vi.mock("@/components/invitations/create-invitation-dialog", () => ({
	CreateInvitationDialog: () => null,
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/user/view");
});

const makeMembers = () => [
	{
		id: "m-1",
		userId: "u-1",
		role: "admin" as const,
		hierarchyScopeId: "node-1",
		status: "active" as const,
		joinedAt: new Date("2024-01-01"),
		name: "Alice Admin",
		email: "alice@example.com",
	},
	{
		id: "m-2",
		userId: "u-2",
		role: "trainer" as const,
		hierarchyScopeId: "node-1",
		status: "active" as const,
		joinedAt: new Date("2024-03-01"),
		name: "Bob Trainer",
		email: "bob@example.com",
	},
];

describe("UserViewPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.members.list.mockResolvedValue([]);
	});

	it("renders page heading", async () => {
		renderWithProviders(<UserViewPage />);
		await waitFor(() => {
			// Breadcrumb: "Users / Members" — heading text is "Members"
			expect(screen.getByText("Members")).toBeInTheDocument();
		});
	});

	it("shows empty state when no members", async () => {
		mockClient.members.list.mockResolvedValue([]);
		renderWithProviders(<UserViewPage />);
		await waitFor(() => {
			expect(screen.getByText("No members yet")).toBeInTheDocument();
		});
	});

	it("renders members grouped by role", async () => {
		mockClient.members.list.mockResolvedValue(makeMembers());
		renderWithProviders(<UserViewPage />);
		// First group (Admins) is defaultOpen=true, so Alice Admin should be visible
		await waitFor(() => {
			expect(screen.getByText("Alice Admin")).toBeInTheDocument();
		});
		// Role group headers are always shown as toggle buttons
		expect(screen.getByText("Admins")).toBeInTheDocument();
		expect(screen.getByText("Trainers")).toBeInTheDocument();
	});

	it("shows member count in role group header", async () => {
		mockClient.members.list.mockResolvedValue(makeMembers());
		renderWithProviders(<UserViewPage />);
		await waitFor(() => {
			expect(screen.getByText("Alice Admin")).toBeInTheDocument();
		});
		// Both Admin and Trainer groups have 1 member each
		const memberCountEls = screen.getAllByText("1 member");
		expect(memberCountEls.length).toBeGreaterThan(0);
	});

	it("search filters out non-matching members", async () => {
		const user = userEvent.setup();
		mockClient.members.list.mockResolvedValue(makeMembers());
		renderWithProviders(<UserViewPage />);
		await waitFor(() => {
			expect(screen.getByText("Alice Admin")).toBeInTheDocument();
		});

		// Typing "bob" hides Alice (Admin group collapses) since no Admins match
		const searchInput = screen.getByPlaceholderText("Search…");
		await user.type(searchInput, "bob");

		await waitFor(() => {
			// Alice Admin's card disappears — she is no longer rendered
			expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
		});
		// The Trainers group header still visible
		expect(screen.getByText("Trainers")).toBeInTheDocument();
	});

	it("search with no match shows no-results state", async () => {
		const user = userEvent.setup();
		mockClient.members.list.mockResolvedValue(makeMembers());
		renderWithProviders(<UserViewPage />);
		await waitFor(() => expect(screen.getByText("Alice Admin")).toBeInTheDocument());

		await user.type(screen.getByPlaceholderText("Search…"), "zzznomatch");

		await waitFor(() => {
			expect(screen.getByText("No employees match your search")).toBeInTheDocument();
		});
	});

	it("admin sees Deactivate action on active member", async () => {
		mockClient.members.list.mockResolvedValue(makeMembers());
		renderWithProviders(<UserViewPage />);
		await waitFor(() => expect(screen.getByText("Alice Admin")).toBeInTheDocument());
		// Admin role group is defaultOpen=true and callerIsAdmin=true
		expect(screen.getAllByRole("button", { name: /deactivate/i }).length).toBeGreaterThan(0);
	});
});
