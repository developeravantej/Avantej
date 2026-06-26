import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: the page calls client.packageInstances.listMemberships directly inside
// a useQuery queryFn — route it through the shared mock client.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

// useApiMutation (via useUnfreezePackageInstance) imports sonner at module load.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Current org + read permission so organizationId resolves and the query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [],
		},
		hasPermission: () => true,
	}),
}));

// Mutable scope state so a test can switch the active scope between renders.
const scopeState = vi.hoisted(() => ({
	scopeNodeId: "branch-x" as string | undefined,
}));

// Scope switcher narrowed to a single branch → scopeNodeId is that node id.
// Full contract so any consumer (incl. the real switcher) wouldn't choke.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: scopeState.scopeNodeId ?? null,
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["node-region-1", "branch-x", "branch-y"],
		scopeNodes: [],
		topAccessibleNodeId: "node-region-1",
		isAllScope: scopeState.scopeNodeId == null,
		scopeNodeId: scopeState.scopeNodeId,
		isScopeReady: true,
	}),
}));

// Header renders <ScopeSwitcher/>, which consumes the full useScope contract.
// Stub it to a no-op — its rendering is covered by the ScopeSwitcher tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

import { MembershipsPage } from "@/components/pages/packages/memberships-page";

describe("MembershipsPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset the active scope between tests so call indexing stays deterministic.
		scopeState.scopeNodeId = "branch-x";
		// Resolve to a valid shape so TanStack Query never throws on undefined data.
		mockClient.packageInstances.listMemberships.mockResolvedValue({
			rows: [],
			total: 0,
		});
	});

	it("injects scopeNodeId as branchId on listMemberships", async () => {
		renderWithProviders(<MembershipsPage />);

		await waitFor(() => {
			expect(mockClient.packageInstances.listMemberships).toHaveBeenCalled();
		});

		// Direct client call → first arg is the input object.
		expect(
			(mockClient.packageInstances.listMemberships as unknown as Mock).mock
				.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			filter: "active",
			branchId: "branch-x",
		});
	});

	it("resets pagination to the first page when the scope changes", async () => {
		// total > PAGE_LIMIT (100) so the Next/Previous pager renders.
		mockClient.packageInstances.listMemberships.mockResolvedValue({
			rows: [],
			total: 250,
		});

		// Render with a `wrapper` (not by baking the provider into the element)
		// so RTL's rerender re-wraps automatically: the QueryClientProvider AND
		// the page's internal `offset` state survive the rerender, which is what
		// lets us flip the scope while the component stays mounted at offset>0.
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const { rerender } = render(<MembershipsPage />, { wrapper });

		const listMemberships = mockClient.packageInstances
			.listMemberships as unknown as Mock;

		// Initial page load at offset 0 for the starting scope. The pager only
		// renders once the query resolves (total=250 > PAGE_LIMIT) and the
		// component re-renders, so wait for the "Next" button to appear rather
		// than asserting on the call alone.
		const nextButton = await screen.findByRole("button", { name: "Next" });

		// Advance to page 2 → offset becomes PAGE_LIMIT (100).
		fireEvent.click(nextButton);
		await waitFor(() => {
			expect(listMemberships.mock.calls.some((c) => c[0].offset === 100)).toBe(
				true,
			);
		});

		// Switch the active scope while sitting on page 2.
		scopeState.scopeNodeId = "branch-y";
		rerender(<MembershipsPage />);

		// The offset-reset effect must snap back to page 0 for the NEW scope:
		// the latest call carries the new branchId AND offset 0 — never the new
		// scope at a stale offset of 100.
		await waitFor(() => {
			const last =
				listMemberships.mock.calls[listMemberships.mock.calls.length - 1][0];
			expect(last).toMatchObject({ branchId: "branch-y", offset: 0 });
		});
	});
});
