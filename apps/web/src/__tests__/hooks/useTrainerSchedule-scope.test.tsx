import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client so the
// appointments.list queryFn resolves back to mockClient.appointments.list with
// the exact input object the hook built.
vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));

// useUserContext supplies the org + an admin member so canViewAllTrainers is
// true (the query fires regardless of trainer selection) and organizationId
// resolves (the query is gated on !!organizationId).
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness",
					hierarchy: {
						nodes: [],
						member: {
							id: "member-caller",
							role: "admin",
							hierarchyScopeId: "node-region-1",
							accessibleNodeIds: ["node-region-1", "branch-x"],
						},
					},
				},
			],
		},
	}),
}));

// ScopeProvider.useScope is the switcher context this task wires in. scopeNodeId
// is the EXACT value the hook must inject as `branchId`. Returns the FULL
// contract so consumers reading other fields don't break.
const useScopeMock = vi.fn();
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => useScopeMock(),
}));

// The route header renders <ScopeSwitcher/>, which consumes the full useScope
// contract. The hook under test doesn't import it, but stub it as a no-op for
// consistency with the reference scope tests.
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

import { useTrainerSchedule } from "@/hooks/useTrainerSchedule";

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: React.ReactNode }) =>
		React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTrainerSchedule scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Resolve appointments.list to a valid (non-undefined) array so TanStack
		// Query never throws "Query data cannot be undefined".
		mockClient.appointments.list.mockResolvedValue([]);
	});

	it("injects scopeNodeId as branchId on the appointments.list query", async () => {
		useScopeMock.mockReturnValue({
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
		});

		renderHook(() => useTrainerSchedule({ organizationId: "org-1" }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(mockClient.appointments.list).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → the
		// first arg is the input object the hook assembled.
		expect(
			(mockClient.appointments.list as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0],
		).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});

	it("passes branchId: undefined when isAllScope (server falls back to full accessibleNodeIds)", async () => {
		useScopeMock.mockReturnValue({
			activeScopeId: "node-region-1",
			activeScopeNode: null,
			setActiveScope: vi.fn(),
			resetScope: vi.fn(),
			accessibleNodeIds: ["node-region-1", "branch-x"],
			scopeNodes: [],
			topAccessibleNodeId: "node-region-1",
			isAllScope: true,
			scopeNodeId: undefined,
			isScopeReady: true,
		});

		renderHook(() => useTrainerSchedule({ organizationId: "org-1" }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(mockClient.appointments.list).toHaveBeenCalled();
		});

		const input = (
			mockClient.appointments.list as unknown as ReturnType<typeof vi.fn>
		).mock.calls[0][0] as Record<string, unknown>;
		// scopeNodeId is the EXACT injected value → key present, value undefined.
		expect("branchId" in input).toBe(true);
		expect(input.branchId).toBeUndefined();
	});
});
