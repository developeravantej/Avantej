import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// The route file calls createFileRoute(...) at module load; capture the page
// component and stub useSearch/useNavigate so the page can render in jsdom.
let ApprovalsPage: React.ComponentType;
const useSearchMock = vi.fn();
const useNavigateMock = vi.fn().mockReturnValue(vi.fn());

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		ApprovalsPage = opts.component;
		return {
			component: opts.component,
			useSearch: useSearchMock,
			useNavigate: useNavigateMock,
		};
	},
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useNavigate: useNavigateMock,
}));

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
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

// Current org + an admin member so organizationId resolves and the query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness",
					role: "admin",
					hierarchy: {
						nodes: [],
						member: {
							id: "member-caller",
							role: "admin",
							hierarchyScopeId: "node-region-1",
							hierarchyScopeName: "Region",
							accessibleNodeIds: ["node-region-1", "branch-x"],
						},
					},
				},
			],
		},
		hasRole: () => true,
		hasPermission: () => true,
		hasAnyPermission: () => true,
	}),
}));

// Scope narrowed to a single branch → scopeNodeId is that node id.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: "branch-x",
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["node-region-1", "branch-x"],
		scopeNodes: [],
		topAccessibleNodeId: "node-region-1",
		isAllScope: false,
		scopeNodeId: "branch-x",
		isScopeReady: true,
	}),
}));

// The header renders <ScopeSwitcher/>, which consumes the FULL useScope contract.
// This test stubs only the scopeNodeId slice, so render the switcher as a no-op —
// its own rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Presentational children mocked → keep the test on the data-fetching layer.
vi.mock("@/features/approvals/components/FilterBar", () => ({
	FilterBar: () => <div data-testid="filter-bar" />,
}));
vi.mock("@/features/approvals/components/HeroStats", () => ({
	HeroStats: () => <div data-testid="hero-stats" />,
}));
vi.mock("@/features/approvals/components/InboxList", () => ({
	InboxList: () => <div data-testid="inbox-list" />,
}));
vi.mock("@/features/approvals/components/ScheduleSessionsPanel", () => ({
	ScheduleSessionsPanel: () => null,
}));
vi.mock("@/components/forms/reject-package-dialog", () => ({
	RejectPackageDialog: () => null,
}));
vi.mock("@/components/ui/status-callout", () => ({
	StatusCallout: ({ message }: { message: string }) => <div>{message}</div>,
}));

beforeEach(async () => {
	vi.clearAllMocks();
	useSearchMock.mockReturnValue({ scope: "all" });
	useNavigateMock.mockReturnValue(vi.fn());
	mockClient.packageInstances.listPending.mockResolvedValue([]);
	await import(
		"@/routes/_authenticated/dashboard/_layout/operations/approvals"
	);
});

describe("ApprovalsPage scope injection", () => {
	it("injects scopeNodeId as branchId on the packageInstances.listPending query", async () => {
		renderWithProviders(<ApprovalsPage />);

		await waitFor(() => {
			expect(mockClient.packageInstances.listPending).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → first arg is the input.
		expect(
			mockClient.packageInstances.listPending.mock.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
