import { describe, test, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// Rewritten 2026-07-12 (web-maturity-remediation plan 7): the previous suite was
// quarantined with describe.skip because it asserted the OLD dashboard UI
// (period tabs, "Revenue by branch" table, KPI cards) that was replaced by
// <DashboardLaunchpad> in the feat/dashboard-launchpad merge. This suite tests
// the launchpad that the /dashboard route actually renders today.
//
// IMPORTANT (project convention): /dashboard must NOT be gated on role or org
// membership — new SaaS owners legitimately land here with 0 orgs. The
// "no organization" case renders a neutral prompt, never a redirect/denial.

const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

// Mutable per-test user-context state; the mock factory closes over it lazily.
const userState: {
	data: { currentOrganizationId: string | null } | undefined;
	isLoading: boolean;
	hasPermission: ReturnType<typeof vi.fn>;
} = {
	data: { currentOrganizationId: ORG_ID },
	isLoading: false,
	hasPermission: vi.fn().mockReturnValue(true),
};

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: userState.data,
		isLoading: userState.isLoading,
		hasPermission: userState.hasPermission,
		hasAnyPermission: vi.fn().mockReturnValue(true),
		hasRole: vi.fn().mockReturnValue(true),
	}),
}));
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({ scopeNodeId: undefined }),
}));
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => <div data-testid="scope-switcher" />,
}));
// Panels have their own heavy data fetching (POS workflow etc.) — stub them.
vi.mock("@/components/pages/launchpad/panels", () => ({
	LaunchpadPanel: ({ id }: { id: string }) => (
		<div data-testid={`panel-${id}`}>Panel {id}</div>
	),
}));

import { DashboardLaunchpad } from "@/components/pages/launchpad/DashboardLaunchpad";

describe("Dashboard launchpad", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		userState.data = { currentOrganizationId: ORG_ID };
		userState.isLoading = false;
		userState.hasPermission = vi.fn().mockReturnValue(true);
		// Badge queries — resolve to empty by default so no badge renders.
		mockClient.analytics.getDashboardKpis.mockResolvedValue({
			totalSales: 0,
			salesOrderCount: 0,
			totalAppointments: 0,
			completedAppointments: 0,
			activeMembersCount: 0,
			revenueByBranch: [],
		});
		mockClient.installments.listUpcoming.mockResolvedValue({
			total: 0,
			items: [],
		});
		mockClient.payouts.list.mockResolvedValue([]);
		mockClient.packageInstances.listExpiring.mockResolvedValue({
			total: 0,
			items: [],
		});
		mockClient.refunds.list.mockResolvedValue({ total: 0, items: [] });
	});

	test("shows loading state while user context is resolving", () => {
		userState.data = undefined;
		userState.isLoading = true;

		renderWithProviders(<DashboardLaunchpad />);

		expect(screen.getByText("Loading your dashboard…")).toBeInTheDocument();
	});

	test("shows neutral org prompt (NOT a denial) when user has no organization", () => {
		// New SaaS owners land on /dashboard with 0 orgs — this must render a
		// prompt, never gate on role/orgs.
		userState.data = { currentOrganizationId: null };

		renderWithProviders(<DashboardLaunchpad />);

		expect(
			screen.getByText("Select an organization to continue."),
		).toBeInTheDocument();
	});

	test("renders Dashboard heading, scope switcher and all daily-task cards for a full-permission user", async () => {
		renderWithProviders(<DashboardLaunchpad />);

		expect(screen.getByText("Dashboard")).toBeInTheDocument();
		expect(screen.getByText("Daily tasks")).toBeInTheDocument();
		expect(screen.getByTestId("scope-switcher")).toBeInTheDocument();

		// All 8 launchpad cards visible when every permission check passes.
		for (const label of [
			"New Sale",
			"Create Customer",
			"View Customers",
			"Renewals / Expiring",
			"Installments",
			"Refunds & Cancellations",
			"Commission Payout",
			"Trainer Schedule",
		]) {
			expect(
				screen.getByRole("button", { name: new RegExp(label) }),
			).toBeInTheDocument();
		}

		// First visible card (New Sale) is active — its panel mounts.
		await waitFor(() => {
			expect(screen.getByTestId("panel-new-sale")).toBeInTheDocument();
		});
	});

	test("hides permission-gated cards the user cannot access", () => {
		// Only POS permission — every other card should disappear.
		userState.hasPermission = vi.fn((perm: string) => perm === "pos:create");

		renderWithProviders(<DashboardLaunchpad />);

		expect(
			screen.getByRole("button", { name: /New Sale/ }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Commission Payout/ }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /View Customers/ }),
		).not.toBeInTheDocument();
	});

	test("shows empty state when no cards are visible for the role", () => {
		userState.hasPermission = vi.fn().mockReturnValue(false);

		renderWithProviders(<DashboardLaunchpad />);

		expect(
			screen.getByText("No tasks available for your role."),
		).toBeInTheDocument();
	});

	test("switching cards mounts the new panel and keeps visited panels alive", async () => {
		const user = userEvent.setup();
		renderWithProviders(<DashboardLaunchpad />);

		// Initial active panel.
		await waitFor(() => {
			expect(screen.getByTestId("panel-new-sale")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("panel-customers")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /View Customers/ }));

		await waitFor(() => {
			expect(screen.getByTestId("panel-customers")).toBeInTheDocument();
		});
		// Keep-alive: the previously visited panel stays mounted (hidden), so a
		// half-built POS sale survives switching cards.
		expect(screen.getByTestId("panel-new-sale")).toBeInTheDocument();
	});

	test("renders worklist badge from installments due count", async () => {
		mockClient.installments.listUpcoming.mockResolvedValue({
			total: 5,
			items: [],
		});

		renderWithProviders(<DashboardLaunchpad />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /Installments/ }),
			).toHaveTextContent("5");
		});
	});

	test("caps badge display at 99+", async () => {
		mockClient.installments.listUpcoming.mockResolvedValue({
			total: 250,
			items: [],
		});

		renderWithProviders(<DashboardLaunchpad />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /Installments/ }),
			).toHaveTextContent("99+");
		});
	});
});
