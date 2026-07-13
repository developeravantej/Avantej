import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

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

// Current session user — drives the self-lockout guard (isSelf) on the page.
const SELF_USER_ID = "self-admin-1";
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { user: { id: SELF_USER_ID } } }),
	},
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PlatformAdminAdminsPage } from "@/components/pages/platform-admin-admins/PlatformAdminAdminsPage";

const selfRow = {
	userId: SELF_USER_ID,
	email: "developer.avantej@gmail.com",
	name: "Dev Avantej",
	role: "super_admin" as const,
	grantedAt: new Date("2026-01-01T00:00:00Z"),
	grantedByEmail: null,
};
const otherRow = {
	userId: "other-admin-2",
	email: "support.person@test.my",
	name: "Support Person",
	role: "support" as const,
	grantedAt: new Date("2026-02-01T00:00:00Z"),
	grantedByEmail: "developer.avantej@gmail.com",
};

describe("PlatformAdminAdminsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.admin.listAdmins.mockResolvedValue([selfRow, otherRow]);
		mockClient.admin.listUsers.mockResolvedValue({
			data: [],
			pagination: {
				currentPage: 1,
				totalPages: 0,
				pageSize: 10,
				totalItems: 0,
			},
		});
	});

	it("renders the admins list with role badges and grantor emails", async () => {
		renderWithProviders(<PlatformAdminAdminsPage />);
		await waitFor(() => {
			// self email appears twice: own row + grantedBy column of the other row
			expect(screen.getAllByText("developer.avantej@gmail.com")).toHaveLength(
				2,
			);
		});
		expect(screen.getByText("support.person@test.my")).toBeInTheDocument();
		expect(screen.getByText("Super Admin")).toBeInTheDocument();
		expect(screen.getByText("Support")).toBeInTheDocument();
		expect(mockClient.admin.listAdmins).toHaveBeenCalled();
	});

	it("self-lockout guard: own row is marked (you) and has NO revoke button", async () => {
		renderWithProviders(<PlatformAdminAdminsPage />);
		await waitFor(() => {
			expect(screen.getByText("(you)")).toBeInTheDocument();
		});
		// Exactly ONE revoke button — the other admin's row. The self row hides it
		// (PlatformAdminAdminsPage.tsx:162 `!isSelf && <Button …Revoke…>`).
		const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
		expect(revokeButtons).toHaveLength(1);
		// And that button lives in the OTHER admin's row, not the self row.
		const otherRowEl = screen
			.getByText("support.person@test.my")
			.closest("tr") as HTMLElement;
		expect(
			within(otherRowEl).getByRole("button", { name: "Revoke" }),
		).toBeInTheDocument();
		const selfRowEl = screen.getByText("(you)").closest("tr") as HTMLElement;
		expect(
			within(selfRowEl).queryByRole("button", { name: "Revoke" }),
		).not.toBeInTheDocument();
	});

	it("revoke flow: confirming the dialog calls revokePlatformAdmin with the row's userId", async () => {
		mockClient.admin.revokePlatformAdmin.mockResolvedValue({ success: true });
		const user = userEvent.setup();
		renderWithProviders(<PlatformAdminAdminsPage />);
		await waitFor(() => {
			expect(screen.getByText("support.person@test.my")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: "Revoke" }));
		// Confirmation dialog opens with the target's email
		await waitFor(() => {
			expect(screen.getByText("Revoke Platform Admin")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: "Revoke Access" }));

		await waitFor(() => {
			expect(mockClient.admin.revokePlatformAdmin).toHaveBeenCalledWith({
				userId: "other-admin-2",
			});
		});
	});

	it("shows the empty state when no admins exist", async () => {
		mockClient.admin.listAdmins.mockResolvedValue([]);
		renderWithProviders(<PlatformAdminAdminsPage />);
		await waitFor(() => {
			expect(screen.getByText("No platform admins found")).toBeInTheDocument();
		});
	});

	it("shows an error callout when listAdmins fails", async () => {
		mockClient.admin.listAdmins.mockRejectedValue(new Error("boom"));
		renderWithProviders(<PlatformAdminAdminsPage />);
		await waitFor(() => {
			expect(screen.getByText("Couldn't load admins")).toBeInTheDocument();
		});
	});

	it("add-admin dialog: searching, selecting a user and granting sends { userId, role: 'support' }", async () => {
		mockClient.admin.listUsers.mockResolvedValue({
			data: [
				{
					id: "user-9",
					email: "newadmin@test.my",
					firstName: "New",
					lastName: "Admin",
					name: "New Admin",
					lastLoginAt: null,
					isPlatformAdmin: false,
					platformAdminRole: null,
				},
			],
			pagination: {
				currentPage: 1,
				totalPages: 1,
				pageSize: 10,
				totalItems: 1,
			},
		});
		mockClient.admin.grantPlatformAdmin.mockResolvedValue({
			success: true,
			role: "support",
		});
		const user = userEvent.setup();
		renderWithProviders(<PlatformAdminAdminsPage />);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add admin/i }),
			).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add admin/i }));
		await waitFor(() => {
			expect(screen.getByText("Add Platform Admin")).toBeInTheDocument();
		});

		// Grant is disabled until a user is selected
		expect(screen.getByRole("button", { name: "Grant Access" })).toBeDisabled();

		// Type in the search box; the 300ms debounce fires the listUsers query
		await user.type(screen.getByPlaceholderText("Search users..."), "newadmin");
		await waitFor(
			() => {
				// oRPC tanstack utils call the client fn as (input, { signal, context })
				expect(mockClient.admin.listUsers).toHaveBeenCalledWith(
					expect.objectContaining({ search: "newadmin", page: 1, limit: 10 }),
					expect.anything(),
				);
			},
			{ timeout: 3000 },
		);

		// Pick the search result
		await waitFor(() => {
			expect(screen.getByText("newadmin@test.my")).toBeInTheDocument();
		});
		await user.click(screen.getByText("newadmin@test.my"));
		await waitFor(() => {
			expect(screen.getByText(/selected:/i)).toBeInTheDocument();
		});

		// Grant with the default role (support) — Radix Select is left untouched
		await user.click(screen.getByRole("button", { name: "Grant Access" }));
		await waitFor(() => {
			expect(mockClient.admin.grantPlatformAdmin).toHaveBeenCalledWith({
				userId: "user-9",
				role: "support",
			});
		});
	});

	it("add-admin dialog filters out users who are already platform admins", async () => {
		mockClient.admin.listUsers.mockResolvedValue({
			data: [
				{
					id: "user-already",
					email: "already.admin@test.my",
					firstName: "Already",
					lastName: "Admin",
					name: "Already Admin",
					lastLoginAt: null,
					isPlatformAdmin: true,
					platformAdminRole: "support",
				},
			],
			pagination: {
				currentPage: 1,
				totalPages: 1,
				pageSize: 10,
				totalItems: 1,
			},
		});
		const user = userEvent.setup();
		renderWithProviders(<PlatformAdminAdminsPage />);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add admin/i }),
			).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /add admin/i }));
		await user.type(screen.getByPlaceholderText("Search users..."), "already");
		await waitFor(
			() => {
				expect(mockClient.admin.listUsers).toHaveBeenCalled();
			},
			{ timeout: 3000 },
		);
		await waitFor(() => {
			expect(screen.getByText("No eligible users found.")).toBeInTheDocument();
		});
		expect(screen.queryByText("already.admin@test.my")).not.toBeInTheDocument();
	});
});
