// apps/web/src/__tests__/components/scope/ScopeProvider.test.tsx
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock useUserContext (the ScopeProvider's only data dependency) before SUT import.
const { mockUseUserContext } = vi.hoisted(() => ({
	mockUseUserContext: vi.fn(),
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: mockUseUserContext,
}));

import { ScopeProvider, useScope } from "@/components/scope/ScopeProvider";
import type { UserContextResponse } from "@/hooks/useUserContext";

const USER_ID = "user-1";
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

function makeContext(
	overrides?: Partial<UserContextResponse>,
): UserContextResponse {
	return {
		user: {
			id: USER_ID,
			email: "e@test.my",
			name: "n",
			firstName: "f",
			lastName: "l",
			emailVerified: true,
		},
		isSystemAdmin: false,
		organizations: [
			{
				id: ORG_A,
				name: "Org A",
				slug: "org-a",
				role: "manager",
				permissions: [],
				hierarchy: {
					nodes: [
						{
							id: "node-root",
							name: "Region",
							type: "region",
							depth: 0,
							parentId: null,
							createdAt: null,
							updatedAt: null,
						},
						{
							id: "node-branch-1",
							name: "Branch 1",
							type: "branch",
							depth: 1,
							parentId: "node-root",
							createdAt: null,
							updatedAt: null,
						},
						{
							id: "node-branch-2",
							name: "Branch 2",
							type: "branch",
							depth: 1,
							parentId: "node-root",
							createdAt: null,
							updatedAt: null,
						},
						{
							id: "node-other",
							name: "No Access",
							type: "branch",
							depth: 1,
							parentId: "node-root",
							createdAt: null,
							updatedAt: null,
						},
					],
					member: {
						id: "member-a",
						role: "manager",
						hierarchyScopeId: "node-root",
						hierarchyScopeName: "Region",
						accessibleNodeIds: ["node-root", "node-branch-1", "node-branch-2"],
					},
				},
			},
		],
		currentOrganizationId: ORG_A,
		...overrides,
	};
}

function makeTwoOrgContext(currentOrganizationId: string): UserContextResponse {
	const base = makeContext();
	const orgA = base.organizations[0];
	const orgB: UserContextResponse["organizations"][number] = {
		...orgA,
		id: ORG_B,
		name: "Org B",
		slug: "org-b",
		hierarchy: {
			nodes: [
				{
					id: "b-root",
					name: "B Region",
					type: "region",
					depth: 0,
					parentId: null,
					createdAt: null,
					updatedAt: null,
				},
				{
					id: "b-branch",
					name: "B Branch",
					type: "branch",
					depth: 1,
					parentId: "b-root",
					createdAt: null,
					updatedAt: null,
				},
			],
			member: {
				id: "member-b",
				role: "manager",
				hierarchyScopeId: "b-root",
				hierarchyScopeName: "B Region",
				accessibleNodeIds: ["b-root", "b-branch"],
			},
		},
	};
	return { ...base, organizations: [orgA, orgB], currentOrganizationId };
}

function setContext(ctx: UserContextResponse | undefined) {
	mockUseUserContext.mockReturnValue({ data: ctx });
}

function wrapper({ children }: { children: React.ReactNode }) {
	return <ScopeProvider>{children}</ScopeProvider>;
}

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	setContext(makeContext());
});

describe("ScopeProvider — default scope", () => {
	it("defaults activeScopeId to the caller's top accessible node (member.hierarchyScopeId)", async () => {
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		expect(result.current.topAccessibleNodeId).toBe("node-root");
		expect(result.current.isAllScope).toBe(true);
		expect(result.current.scopeNodeId).toBeUndefined();
		expect(result.current.activeScopeNode?.id).toBe("node-root");
		expect(result.current.isScopeReady).toBe(true);
	});

	it("exposes only accessible nodes as scopeNodes (excludes nodes outside accessibleNodeIds)", async () => {
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		const ids = result.current.scopeNodes.map((n) => n.id);
		expect(ids).toEqual(["node-root", "node-branch-1", "node-branch-2"]);
		expect(ids).not.toContain("node-other");
	});
});

describe("ScopeProvider — persistence + validation", () => {
	it("restores a persisted scope when it is still within accessibleNodeIds", async () => {
		localStorage.setItem(`scope:${USER_ID}:${ORG_A}`, "node-branch-1");
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() =>
			expect(result.current.activeScopeId).toBe("node-branch-1"),
		);
		expect(result.current.isAllScope).toBe(false);
		expect(result.current.scopeNodeId).toBe("node-branch-1");
	});

	it("falls back to the top accessible node when the persisted scope is stale/inaccessible", async () => {
		localStorage.setItem(`scope:${USER_ID}:${ORG_A}`, "node-deleted");
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		expect(result.current.isAllScope).toBe(true);
	});
});

describe("ScopeProvider — setActiveScope", () => {
	it("updates state, persists per (userId, organizationId), and narrows scopeNodeId", async () => {
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		act(() => result.current.setActiveScope("node-branch-2"));
		await waitFor(() =>
			expect(result.current.activeScopeId).toBe("node-branch-2"),
		);
		expect(result.current.scopeNodeId).toBe("node-branch-2");
		expect(result.current.isAllScope).toBe(false);
		expect(localStorage.getItem(`scope:${USER_ID}:${ORG_A}`)).toBe(
			"node-branch-2",
		);
	});

	it("ignores setActiveScope for a node outside accessibleNodeIds (switcher can only NARROW)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		act(() => result.current.setActiveScope("node-other"));
		expect(result.current.activeScopeId).toBe("node-root");
		expect(localStorage.getItem(`scope:${USER_ID}:${ORG_A}`)).toBeNull();
		warn.mockRestore();
	});
});

describe("ScopeProvider — org switch reset", () => {
	it("resets the active scope when the current organization switches", async () => {
		setContext(makeTwoOrgContext(ORG_A));
		const { result, rerender } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		act(() => result.current.setActiveScope("node-branch-1"));
		await waitFor(() =>
			expect(result.current.activeScopeId).toBe("node-branch-1"),
		);

		setContext(makeTwoOrgContext(ORG_B));
		rerender();

		await waitFor(() => expect(result.current.activeScopeId).toBe("b-root"));
		expect(result.current.topAccessibleNodeId).toBe("b-root");
		expect(result.current.isAllScope).toBe(true);
	});
});

describe("ScopeProvider — unloaded context", () => {
	it("yields a null/empty scope when user context has not loaded", async () => {
		setContext(undefined);
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.isScopeReady).toBe(false));
		expect(result.current.activeScopeId).toBeNull();
		expect(result.current.accessibleNodeIds).toEqual([]);
		expect(result.current.scopeNodeId).toBeUndefined();
		expect(result.current.scopeNodes).toEqual([]);
	});
});

describe("useScope — guard", () => {
	it("throws when used outside a ScopeProvider", () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => renderHook(() => useScope())).toThrow(
			"useScope must be used within a ScopeProvider.",
		);
		err.mockRestore();
	});
});
