import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../../helpers/mock-client";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// oRPC: both `client` (mutations) and `orpc` (queryOptions) come from the shared
// proxy mock so `orpc.x.y.queryOptions()` resolves its queryFn back to
// `mockClient.x.y` (see helpers/mock-client.ts).
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));

// useUserContext is mutated per-test via this holder so each scenario can swap
// the org / permissions without re-mocking the module.
const userContextHolder: { value: unknown } = { value: undefined };
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => userContextHolder.value,
}));

// jsdom doesn't implement the pointer-capture / scroll APIs Radix relies on for
// its DropdownMenu + Select. Shim them so userEvent can open the menus.
vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
	},
}));

import { MembersTabPage } from "@/components/pages/access-control/members-tab";
import { toast } from "sonner";

// jsdom lacks the pointer-capture + scroll APIs Radix uses to open menus/selects.
if (!Element.prototype.hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
	Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
	Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = () => {};
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORG_ID = "org-1";

function makeUserContext(overrides?: Partial<Record<string, unknown>>) {
	return {
		data: {
			currentOrganizationId: ORG_ID,
			organizations: [
				{
					id: ORG_ID,
					name: "Test Fitness Franchise",
					hierarchy: {
						member: { hierarchyScopeId: "scope-1" },
					},
				},
			],
			...overrides,
		},
		// The component does not call these, but mirror the real hook shape so
		// future permission gating wouldn't crash the test harness.
		hasPermission: () => true,
		hasRole: () => true,
	};
}

const ADMIN_MEMBER = {
	id: "m-admin",
	name: "Ahmad Firdaus",
	email: "admin@test.my",
	role: "admin" as const,
	status: "active" as const,
	deletedAt: null,
	ghlSync: null,
	hierarchyScopeId: "scope-1",
	roleId: null,
};

const CLIENT_MEMBER = {
	id: "m-client",
	name: "Siti Client",
	email: "client@test.my",
	role: "client" as const,
	status: "active" as const,
	deletedAt: null,
	ghlSync: null,
	hierarchyScopeId: "scope-1",
	roleId: null,
};

const INACTIVE_MEMBER = {
	id: "m-inactive",
	name: "Lim Inactive",
	email: "inactive@test.my",
	role: "staff" as const,
	status: "inactive" as const,
	deletedAt: null,
	ghlSync: null,
	hierarchyScopeId: "scope-1",
	roleId: null,
};

function primeQueries(members: unknown[], roles: unknown[] = []) {
	mockClient.members.list.mockResolvedValue(members);
	mockClient.roles.list.mockResolvedValue(roles);
	mockClient.hierarchy.listNodes.mockResolvedValue({ nodes: [] });
}

// Opens the per-card "MoreVertical" dropdown for a given member card and returns
// the menu element. Radix renders menu content in a portal on document.body.
async function openCardMenu(
	user: ReturnType<typeof userEvent.setup>,
	name: string,
) {
	const heading = screen.getByText(name);
	const card = heading.closest("[class*='transition-all']") as HTMLElement;
	const trigger = within(card).getByRole("button");
	await user.click(trigger);
	return waitFor(() => screen.getByRole("menu"));
}

beforeEach(() => {
	vi.clearAllMocks();
	userContextHolder.value = makeUserContext();
	primeQueries([], []);
});

describe("MembersTabPage — list render", () => {
	it("renders a card per member from query data", async () => {
		primeQueries([ADMIN_MEMBER, CLIENT_MEMBER]);
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => {
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument();
		});
		expect(screen.getByText("Siti Client")).toBeInTheDocument();
		expect(screen.getByText("admin@test.my")).toBeInTheDocument();
		expect(screen.getByText("client@test.my")).toBeInTheDocument();
	});

	it("renders the Total Users stat reflecting the row count", async () => {
		primeQueries([ADMIN_MEMBER, CLIENT_MEMBER, INACTIVE_MEMBER]);
		renderWithProviders(<MembersTabPage />);

		// Total = 3, Active = 2 (one inactive). Assert via the labelled stat blocks.
		await waitFor(() => {
			const total = screen
				.getByText("Total Users")
				.closest("div")?.parentElement;
			expect(within(total as HTMLElement).getByText("3")).toBeInTheDocument();
		});
		const active = screen
			.getByText("Active Users")
			.closest("div")?.parentElement;
		expect(within(active as HTMLElement).getByText("2")).toBeInTheDocument();
	});

	it("marks an inactive member with the Inactive badge", async () => {
		primeQueries([INACTIVE_MEMBER]);
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => {
			expect(screen.getByText("Lim Inactive")).toBeInTheDocument();
		});
		expect(screen.getByText("Inactive")).toBeInTheDocument();
	});
});

describe("MembersTabPage — loading / empty / error states", () => {
	it("shows the loading overlay while the members query is pending", async () => {
		// Never-resolving promise keeps the query in `pending`.
		mockClient.members.list.mockReturnValue(new Promise(() => {}));
		mockClient.roles.list.mockReturnValue(new Promise(() => {}));
		mockClient.hierarchy.listNodes.mockResolvedValue({ nodes: [] });

		renderWithProviders(<MembersTabPage />);

		expect(await screen.findByText("Loading…")).toBeInTheDocument();
	});

	it("shows the empty state with an Invite CTA when there are no members and no filters", async () => {
		primeQueries([], []);
		renderWithProviders(<MembersTabPage />);

		expect(await screen.findByText("No members found")).toBeInTheDocument();
		expect(
			screen.getByText("Get started by inviting your first user."),
		).toBeInTheDocument();
		// EmptyState CTA (context !== "search") renders an "Invite User" button.
		expect(
			screen.getAllByRole("button", { name: "Invite User" }).length,
		).toBeGreaterThan(0);
	});

	it("falls back to the empty state when the members query errors (no dedicated error UI)", async () => {
		// The component swallows query errors (default EMPTY_MEMBERS), so the
		// observable behaviour on error is the empty state, not an error panel.
		mockClient.members.list.mockRejectedValue(new Error("boom"));
		mockClient.roles.list.mockResolvedValue([]);
		mockClient.hierarchy.listNodes.mockResolvedValue({ nodes: [] });

		renderWithProviders(<MembersTabPage />);

		expect(await screen.findByText("No members found")).toBeInTheDocument();
	});

	it("shows the search-context empty state (no CTA) when a filter excludes all members", async () => {
		primeQueries([ADMIN_MEMBER]);
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		await user.type(
			screen.getByPlaceholderText("Search users..."),
			"zzz-no-match",
		);

		await waitFor(() => {
			expect(screen.getByText("No members found")).toBeInTheDocument();
		});
		expect(
			screen.getByText("No users match your current filters."),
		).toBeInTheDocument();
	});
});

describe("MembersTabPage — RBAC / role-gated actions", () => {
	it("always renders the top-level Invite User action for an org member", async () => {
		primeQueries([ADMIN_MEMBER]);
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		// Header invite button is always present.
		expect(
			screen.getAllByRole("button", { name: /Invite User/i }).length,
		).toBeGreaterThan(0);
	});

	it("offers Move to branch for a staff/admin member", async () => {
		primeQueries([ADMIN_MEMBER]);
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		await openCardMenu(user, "Ahmad Firdaus");

		expect(
			screen.getByRole("menuitem", { name: /Move .* to a different branch/i }),
		).toBeInTheDocument();
	});

	it("hides Move to branch for a client member (canMoveBranch === false)", async () => {
		primeQueries([CLIENT_MEMBER]);
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Siti Client"));
		await openCardMenu(user, "Siti Client");

		// Edit Roles is always present; Move to branch must be absent for clients.
		expect(
			screen.getByRole("menuitem", { name: /Edit Roles/i }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("menuitem", {
				name: /Move .* to a different branch/i,
			}),
		).not.toBeInTheDocument();
	});
});

describe("MembersTabPage — mutation flows", () => {
	it("deactivate action calls client.members.deactivate with org + member id", async () => {
		primeQueries([ADMIN_MEMBER]);
		mockClient.members.deactivate.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		await openCardMenu(user, "Ahmad Firdaus");
		await user.click(
			screen.getByRole("menuitem", { name: /Deactivate User/i }),
		);

		await waitFor(() => {
			expect(mockClient.members.deactivate).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				memberId: ADMIN_MEMBER.id,
			});
		});
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith(
				expect.stringContaining("deactivated"),
			),
		);
	});

	it("reactivate path is used for an inactive member", async () => {
		primeQueries([INACTIVE_MEMBER]);
		mockClient.members.reactivate.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Lim Inactive"));
		await openCardMenu(user, "Lim Inactive");
		// For an inactive user the item label is "Activate User".
		await user.click(screen.getByRole("menuitem", { name: /Activate User/i }));

		await waitFor(() => {
			expect(mockClient.members.reactivate).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				memberId: INACTIVE_MEMBER.id,
			});
		});
		expect(mockClient.members.deactivate).not.toHaveBeenCalled();
	});

	it("delete action calls client.members.softDelete", async () => {
		primeQueries([ADMIN_MEMBER]);
		mockClient.members.softDelete.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		await openCardMenu(user, "Ahmad Firdaus");
		await user.click(screen.getByRole("menuitem", { name: /^Delete$/i }));

		await waitFor(() => {
			expect(mockClient.members.softDelete).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				memberId: ADMIN_MEMBER.id,
			});
		});
	});

	it("role-update flow: Edit Roles → Save calls client.members.updateRole", async () => {
		primeQueries([ADMIN_MEMBER]);
		mockClient.members.updateRole.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		await openCardMenu(user, "Ahmad Firdaus");
		await user.click(screen.getByRole("menuitem", { name: /Edit Roles/i }));

		// Dialog opens; default selected role is "staff".
		await screen.findByText(/Assign Role to Ahmad Firdaus/i);
		await user.click(screen.getByRole("button", { name: /Save Changes/i }));

		await waitFor(() => {
			expect(mockClient.members.updateRole).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				memberId: ADMIN_MEMBER.id,
				newRole: "staff",
			});
		});
	});

	it("invite flow: opening the dialog, entering an email, and sending calls invitations.create", async () => {
		primeQueries([ADMIN_MEMBER]);
		mockClient.invitations.create.mockResolvedValue({
			invitation: { token: "tok", email: "new@test.my", role: "staff" },
			organizationName: "Test Fitness Franchise",
			inviterName: "Admin",
		});
		mockClient.invitations.sendEmail.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		// Header invite button (first match).
		await user.click(
			screen.getAllByRole("button", { name: /Invite User/i })[0],
		);

		const emailInput = await screen.findByPlaceholderText("Enter user email");
		await user.type(emailInput, "new@test.my");
		await user.click(screen.getByRole("button", { name: /Send Invitation/i }));

		await waitFor(() => {
			expect(mockClient.invitations.create).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				email: "new@test.my",
				role: "staff",
				hierarchyScopeId: "scope-1",
			});
		});
	});

	it("invite flow guards against an empty email (no create call)", async () => {
		primeQueries([ADMIN_MEMBER]);
		const user = userEvent.setup();
		renderWithProviders(<MembersTabPage />);

		await waitFor(() => screen.getByText("Ahmad Firdaus"));
		await user.click(
			screen.getAllByRole("button", { name: /Invite User/i })[0],
		);
		await screen.findByPlaceholderText("Enter user email");
		await user.click(screen.getByRole("button", { name: /Send Invitation/i }));

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				expect.stringContaining("email"),
			),
		);
		expect(mockClient.invitations.create).not.toHaveBeenCalled();
	});
});
