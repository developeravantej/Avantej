/**
 * Tests for hooks/useUserContext.ts
 *
 * Critical regression coverage (MEMORY.md):
 *   The hook previously had a try/catch that silently swallowed errors and
 *   returned MOCK_USER_CONTEXT. The fix removed that fallback. These tests
 *   lock that behavior in so it cannot regress silently.
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mock @/utils/orpc before any import of the SUT
// vi.hoisted ensures the mock fn is defined before vi.mock is hoisted to top.
// ---------------------------------------------------------------------------

const { mockUserContext } = vi.hoisted(() => ({
	mockUserContext: vi.fn(),
}));

vi.mock("@/utils/orpc", () => ({
	// `client` is the only thing useUserContext imports from this module
	client: {
		auth: {
			userContext: mockUserContext,
		},
	},
	// `orpc` is exported but not used by useUserContext; include as stub
	orpc: {},
}));

// Import SUT AFTER the mock is declared (vi.mock is hoisted, so ordering is safe)
import { useUserContext } from "@/hooks/useUserContext";
import type { UserContextResponse } from "@/hooks/useUserContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ORG_UUID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

function makeResponse(
	overrides?: Partial<UserContextResponse>,
): UserContextResponse {
	return {
		user: {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			firstName: "Test",
			lastName: "User",
			emailVerified: true,
		},
		isSystemAdmin: false,
		organizations: [
			{
				id: TEST_ORG_UUID,
				name: "Test Org",
				slug: "test-org",
				role: "admin",
				permissions: ["user_management:read", "user_management:write"],
				hierarchy: {
					nodes: [],
					member: {
						id: "member-1",
						role: "admin",
						hierarchyScopeId: "node-1",
						hierarchyScopeName: "Branch A",
						accessibleNodeIds: ["node-1"],
					},
				},
			},
		],
		currentOrganizationId: TEST_ORG_UUID,
		...overrides,
	};
}

/** Create a fresh QueryClient per test (retry: false to fail fast) */
function makeWrapper() {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	function Wrapper({ children }: { children: React.ReactNode }) {
		return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
	}
	return Wrapper;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1: localStorage empty + no session → query fires but returns undefined synchronously
// ---------------------------------------------------------------------------

describe("useUserContext — empty localStorage, no session", () => {
	it("does NOT return MOCK_USER_CONTEXT when localStorage is empty (regression: silent fallback removed)", async () => {
		// API is pending (never resolves during this test)
		mockUserContext.mockImplementation(() => new Promise(() => {}));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		// Before the query resolves, data should be undefined (not a mock user)
		expect(result.current.data).toBeUndefined();
		// Should be in a loading/fetching state
		expect(result.current.isPending || result.current.isFetching).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: localStorage has cached org → returned as initialData synchronously
// ---------------------------------------------------------------------------

describe("useUserContext — localStorage cache", () => {
	it("uses localStorage as initialData before the query completes", async () => {
		// Seed localStorage with a valid UUID org
		const cachedOrgs = [
			{
				id: TEST_ORG_UUID,
				name: "Cached Org",
				slug: "cached-org",
				role: "staff",
				permissions: ["reports:view"],
			},
		];
		localStorage.setItem("user_organizations", JSON.stringify(cachedOrgs));
		localStorage.setItem("current_organization_id", TEST_ORG_UUID);

		// API is slow — never resolves during this test
		mockUserContext.mockImplementation(() => new Promise(() => {}));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		// initialData is computed synchronously — data should be available immediately
		expect(result.current.data).not.toBeUndefined();
		expect(result.current.data?.currentOrganizationId).toBe(TEST_ORG_UUID);
		expect(result.current.data?.organizations[0]?.id).toBe(TEST_ORG_UUID);
	});

	it("does NOT use localStorage as initialData when orgId is not a valid UUID", async () => {
		// Seed with a non-UUID org ID (e.g. the old 'org-1' format)
		localStorage.setItem(
			"user_organizations",
			JSON.stringify([
				{
					id: "org-1",
					name: "Old Org",
					slug: "old",
					role: "staff",
					permissions: [],
				},
			]),
		);
		localStorage.setItem("current_organization_id", "org-1");

		mockUserContext.mockImplementation(() => new Promise(() => {}));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		// The UUID guard in initialData should produce null currentOrganizationId
		// but the orgs array may still be populated — what matters is currentOrganizationId is null
		if (result.current.data) {
			expect(result.current.data.currentOrganizationId).toBeNull();
		} else {
			// Hook returned undefined — also acceptable (no valid initialData)
			expect(result.current.data).toBeUndefined();
		}
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: Query succeeds → data returned, localStorage updated
// ---------------------------------------------------------------------------

describe("useUserContext — successful query", () => {
	it("returns the API response and updates localStorage", async () => {
		const apiResponse = makeResponse();
		mockUserContext.mockResolvedValue(apiResponse);

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.data?.currentOrganizationId).toBe(TEST_ORG_UUID);
		expect(result.current.data?.organizations[0]?.id).toBe(TEST_ORG_UUID);

		// localStorage should be populated after success
		const storedOrgId = localStorage.getItem("current_organization_id");
		expect(storedOrgId).toBe(TEST_ORG_UUID);

		const storedOrgs = JSON.parse(
			localStorage.getItem("user_organizations") ?? "null",
		);
		expect(Array.isArray(storedOrgs)).toBe(true);
		expect(storedOrgs[0].id).toBe(TEST_ORG_UUID);
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: Query errors — REGRESSION TEST for silent MOCK_USER_CONTEXT fallback
// ---------------------------------------------------------------------------

describe("useUserContext — query error (REGRESSION)", () => {
	it("surfaces the error state and does NOT return MOCK_USER_CONTEXT", async () => {
		// This is the critical test: in the old broken code, any error would be caught
		// and a mock user was returned instead. The fix removes that fallback entirely.
		mockUserContext.mockRejectedValue(new Error("Unauthorized"));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		// Wait for the query to settle into an error state
		// retry: false on the QueryClient means this happens quickly
		await waitFor(() => expect(result.current.isError).toBe(true), {
			timeout: 3000,
		});

		// data MUST be undefined — never the mock user
		expect(result.current.data).toBeUndefined();

		// Confirm the error is surfaced (not swallowed)
		expect(result.current.error).not.toBeNull();
		expect((result.current.error as Error).message).toBe("Unauthorized");
	});

	it("does NOT write stale data to localStorage when the query fails", async () => {
		mockUserContext.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isError).toBe(true), {
			timeout: 3000,
		});

		// localStorage should remain empty — no stale org written on failure
		expect(localStorage.getItem("current_organization_id")).toBeNull();
		expect(localStorage.getItem("user_organizations")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: hasPermission derived helper
// ---------------------------------------------------------------------------

describe("useUserContext — hasPermission", () => {
	it("returns true for a permission the org grants", async () => {
		mockUserContext.mockResolvedValue(makeResponse());

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasPermission("user_management:read")).toBe(true);
		expect(result.current.hasPermission("user_management:write")).toBe(true);
	});

	it("returns false for a permission the org does NOT grant", async () => {
		mockUserContext.mockResolvedValue(makeResponse());

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasPermission("billing:delete")).toBe(false);
	});

	it("returns true for any permission when user is system admin", async () => {
		mockUserContext.mockResolvedValue(makeResponse({ isSystemAdmin: true }));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasPermission("billing:delete")).toBe(true);
		expect(result.current.hasPermission("any:permission")).toBe(true);
	});

	it("returns false when data is undefined (no session)", () => {
		mockUserContext.mockImplementation(() => new Promise(() => {}));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		// Query still pending — data is undefined
		expect(result.current.hasPermission("user_management:read")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: hasRole derived helper
// ---------------------------------------------------------------------------

describe("useUserContext — hasRole", () => {
	it("returns true when member role matches (case-insensitive)", async () => {
		mockUserContext.mockResolvedValue(makeResponse());

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		// member.role is "admin" in the fixture
		expect(result.current.hasRole(["admin"])).toBe(true);
		expect(result.current.hasRole(["Admin"])).toBe(true); // case-insensitive
		expect(result.current.hasRole(["ADMIN"])).toBe(true);
	});

	it("returns false when member role does not match", async () => {
		mockUserContext.mockResolvedValue(makeResponse());

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasRole(["staff", "manager"])).toBe(false);
	});

	it("returns true for any role when user is system admin", async () => {
		mockUserContext.mockResolvedValue(makeResponse({ isSystemAdmin: true }));

		const { result } = renderHook(() => useUserContext(), {
			wrapper: makeWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasRole(["nonexistent-role"])).toBe(true);
	});
});
