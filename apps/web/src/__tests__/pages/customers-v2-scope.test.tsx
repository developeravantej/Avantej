import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	type Mock,
} from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

let CustomersV2Page: React.ComponentType;
const useSearchMock = vi.fn();
const useNavigateMock = vi.fn().mockReturnValue(vi.fn());

// createFileRoute → capture the component; jsdom lacks router context for <Link>.
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		CustomersV2Page = opts.component;
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

// Current org + read permission so organizationId resolves and the query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Org",
					hierarchy: { nodes: [], member: { accessibleNodeIds: [] } },
				},
			],
		},
		hasPermission: (perm: string) =>
			["customer_management:read", "user_management:create"].includes(perm),
		hasRole: () => false,
	}),
}));

// No debounce delay → search resolves synchronously.
vi.mock("@/hooks/useDebounce", () => ({
	useDebounce: (val: unknown) => val,
}));

// Scope narrowed to a single branch → scopeNodeId is that node id.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: "branch-x",
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: [],
		scopeNodes: [],
		topAccessibleNodeId: null,
		isAllScope: false,
		scopeNodeId: "branch-x",
		isScopeReady: true,
	}),
}));

// Real switcher would crash on the partial provider mock → stub to null.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

// Heavy sub-panels stubbed → keep the test on the data-fetching layer.
vi.mock("@/components/customers/customers-filter-sidebar", () => ({
	CustomersFilterSidebar: () => <div data-testid="filter-sidebar" />,
}));
vi.mock("@/components/customers/customer-profile-panel", () => ({
	CustomerProfilePanel: () => <div data-testid="profile-panel" />,
}));
vi.mock("@/components/customers/add-customer-dialog", () => ({
	AddCustomerDialog: () => null,
}));

const defaultSearch = {
	tab: "customers",
	customer: undefined,
	showDeleted: undefined,
};

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/customers/v2/view");
});

describe("CustomersV2Page scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSearchMock.mockReturnValue(defaultSearch);
		useNavigateMock.mockReturnValue(vi.fn());
		mockClient.customerDirectory.list.mockResolvedValue({ rows: [], total: 0 });
	});

	it("injects scopeNodeId as branchId on the customerDirectory.list query", async () => {
		renderWithProviders(<CustomersV2Page />);

		await waitFor(() => {
			const fn = mockClient.customerDirectory.list as unknown as Mock;
			expect(fn.mock.calls.length).toBeGreaterThan(0);
			expect(fn.mock.calls[0]?.[0]).toMatchObject({
				organizationId: "org-1",
				branchId: "branch-x",
			});
		});
	});
});
