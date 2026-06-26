import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// The sales page is a route file — capture its component via the createFileRoute
// mock and feed search params through Route.useSearch (mirrors sales-view.test.tsx).
let RouteComponent: React.ComponentType;
const useSearchMock = vi.fn();
const useNavigateMock = vi.fn().mockReturnValue(vi.fn());

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		RouteComponent = opts.component;
		return {
			component: opts.component,
			useSearch: useSearchMock,
			fullPath: "/_authenticated/dashboard/_layout/sales/view",
		};
	},
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
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

// Current org + member so organizationId resolves and every scoped query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness",
					hierarchy: { nodes: [], member: { accessibleNodeIds: [] } },
				},
			],
		},
		hasPermission: () => true,
		hasRole: () => true,
	}),
}));

// Scope narrowed to a single branch → scopeNodeId is that node id. Full contract
// so the page (and anything reading useScope) sees a complete shape.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: "branch-x",
		isAllScope: false,
		activeScopeId: "branch-x",
		accessibleNodeIds: ["branch-x"],
		scopeNodes: [],
		topAccessibleNodeId: "branch-x",
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		isScopeReady: true,
		activeScopeNode: null,
	}),
}));

// The header renders <ScopeSwitcher/>, which consumes the FULL useScope contract.
// We only stub the scopeNodeId slice here, so render the switcher as a no-op —
// its own rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Stub heavy table components (keeps the test on the data-fetching layer).
vi.mock("@/components/tables/sales/view/data-table", () => ({
	default: () => <div data-testid="sales-table" />,
}));
vi.mock("@/components/tables/payment/view/data-table", () => ({
	default: () => <div data-testid="payment-table" />,
}));

const defaultSearch = {
	from: "",
	to: "",
	status: "",
	branchId: "",
	period: undefined,
	kpiPeriod: "month" as const,
	refundStatus: "all" as const,
	tab: "sales" as const,
	instStatus: "due_soon" as const,
	search: "",
};

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/sales/view");
});

describe("Sales view scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSearchMock.mockReturnValue(defaultSearch);
		useNavigateMock.mockReturnValue(vi.fn());
		mockClient.salesOrders.list.mockResolvedValue({ rows: [], total: 0 });
		mockClient.salesOrders.kpiSummary.mockResolvedValue(null);
		mockClient.invoices.list.mockResolvedValue([]);
		mockClient.installments.listUpcoming.mockResolvedValue({ total: 0 });
	});

	it("injects scopeNodeId as branchId on the salesOrders.list query", async () => {
		renderWithProviders(<RouteComponent />);

		await waitFor(() => {
			expect(mockClient.salesOrders.list).toHaveBeenCalled();
		});

		// orpc/tanstack queryFn calls the client as (input, …) → first arg is input.
		expect(mockClient.salesOrders.list.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});
});
