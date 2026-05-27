/**
 * Unit tests for lib/permissions.ts
 *
 * Exported surface under test:
 *   - flattenUserPermissions(user: UserWithPermissions): FlattenedPermission[]
 *   - checkUserPermission(user, requiredPermission, organizationId?, permissionMap?): PermissionCheckResult
 *   - checkUserRole(user, roleName, organizationId?): PermissionCheckResult
 *
 * These are pure functions — no React, no QueryClient.
 */

import { describe, it, expect } from "vitest";
import {
	flattenUserPermissions,
	checkUserPermission,
	checkUserRole,
} from "@/lib/permissions";
import type { UserWithPermissions } from "@/types/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(
	overrides?: Partial<UserWithPermissions>,
): UserWithPermissions {
	return {
		id: "user-1",
		email: "test@example.com",
		full_name: "Test User",
		phone: null,
		is_system_admin: false,
		is_active: true,
		created_at: "2024-01-01T00:00:00Z",
		updated_at: "2024-01-01T00:00:00Z",
		last_login: null,
		current_organization_id: "org-1",
		organizations: [],
		...overrides,
	};
}

function makeOrg(
	id = "org-1",
	roles: UserWithPermissions["organizations"][0]["roles"] = [],
) {
	return { id, name: "Org", roles };
}

function makeRole(
	id: string,
	name: string,
	permissions: Array<{
		resource: string;
		actions: string[];
		scope?: "own" | "team" | "organization";
	}> = [],
) {
	return {
		id,
		name,
		description: null,
		priority: 1,
		permissions: permissions.map((p) => ({
			resource: p.resource,
			actions: p.actions,
			scope: (p.scope ?? "organization") as "own" | "team" | "organization",
			field_permissions: {},
			conditions: {},
		})),
	};
}

// ---------------------------------------------------------------------------
// flattenUserPermissions
// ---------------------------------------------------------------------------

describe("flattenUserPermissions", () => {
	it("returns [] for a user with no organizations", () => {
		const user = makeUser({ organizations: [] });
		expect(flattenUserPermissions(user)).toEqual([]);
	});

	it("returns [] for a user with orgs but no roles", () => {
		const user = makeUser({ organizations: [makeOrg("org-1", [])] });
		expect(flattenUserPermissions(user)).toEqual([]);
	});

	it("flattens a single permission with a single action", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [
					makeRole("r-1", "Admin", [{ resource: "users", actions: ["read"] }]),
				]),
			],
		});
		const result = flattenUserPermissions(user);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			resource: "users",
			actions: ["read"],
			organizationId: "org-1",
			roleName: "Admin",
			roleId: "r-1",
		});
	});

	it("expands multiple actions into separate flattened permissions", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [
					makeRole("r-1", "Admin", [
						{ resource: "users", actions: ["read", "write", "delete"] },
					]),
				]),
			],
		});
		const result = flattenUserPermissions(user);
		// Each action becomes its own entry
		expect(result).toHaveLength(3);
		const actions = result.map((p) => p.actions[0]);
		expect(actions).toContain("read");
		expect(actions).toContain("write");
		expect(actions).toContain("delete");
	});

	it("deduplicates identical permission+action combinations", () => {
		// Same resource+action+scope+orgId+roleId combination appears twice
		const role = makeRole("r-1", "Admin", [
			{ resource: "users", actions: ["read"] },
			{ resource: "users", actions: ["read"] }, // duplicate
		]);
		const user = makeUser({
			organizations: [makeOrg("org-1", [role])],
		});
		const result = flattenUserPermissions(user);
		expect(result).toHaveLength(1);
	});

	it("collects permissions across multiple organizations", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [
					makeRole("r-1", "Admin", [{ resource: "users", actions: ["read"] }]),
				]),
				makeOrg("org-2", [
					makeRole("r-2", "Manager", [
						{ resource: "reports", actions: ["view"] },
					]),
				]),
			],
		});
		const result = flattenUserPermissions(user);
		expect(result).toHaveLength(2);
		const orgIds = result.map((p) => p.organizationId);
		expect(orgIds).toContain("org-1");
		expect(orgIds).toContain("org-2");
	});

	it("returns [] when user fails the isUserWithPermissions type guard", () => {
		// Pass an object that lacks the `organizations` array
		const badUser = { id: "x", email: "x@x.com" } as unknown as UserWithPermissions;
		expect(flattenUserPermissions(badUser)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// checkUserPermission
// ---------------------------------------------------------------------------

describe("checkUserPermission", () => {
	it("returns hasPermission: false for null user", () => {
		const result = checkUserPermission(null, { resource: "users", action: "read" });
		expect(result.hasPermission).toBe(false);
		expect(result.reason).toMatch(/not authenticated/i);
	});

	it("returns hasPermission: false when user has no matching permission", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [
					makeRole("r-1", "Staff", [{ resource: "reports", actions: ["view"] }]),
				]),
			],
		});
		const result = checkUserPermission(user, { resource: "users", action: "read" });
		expect(result.hasPermission).toBe(false);
	});

	it("returns hasPermission: true when user has matching resource+action", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [
					makeRole("r-1", "Admin", [{ resource: "users", actions: ["read"] }]),
				]),
			],
		});
		const result = checkUserPermission(user, { resource: "users", action: "read" });
		expect(result.hasPermission).toBe(true);
	});

	it("system admin always returns hasPermission: true regardless of permissions", () => {
		const user = makeUser({
			is_system_admin: true,
			organizations: [],
		});
		const result = checkUserPermission(user, {
			resource: "billing",
			action: "delete",
		});
		expect(result.hasPermission).toBe(true);
		expect(result.reason).toMatch(/system administrator/i);
	});

	it("filters to organizationId when provided — does not match other orgs", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [
					makeRole("r-1", "Admin", [{ resource: "users", actions: ["read"] }]),
				]),
				makeOrg("org-2", []),
			],
		});
		// Permission exists in org-1 but we ask for org-2
		const result = checkUserPermission(
			user,
			{ resource: "users", action: "read" },
			"org-2",
		);
		expect(result.hasPermission).toBe(false);
	});

	it("uses permissionMap for O(1) lookup when provided", () => {
		const user = makeUser({
			current_organization_id: "org-1",
			organizations: [],
		});
		const map = new Map([["users:read", true]]);
		const result = checkUserPermission(
			user,
			{ resource: "users", action: "read" },
			undefined,
			map,
		);
		expect(result.hasPermission).toBe(true);
	});

	it("permissionMap miss returns hasPermission: false", () => {
		const user = makeUser({
			current_organization_id: "org-1",
			organizations: [],
		});
		const map = new Map([["reports:view", true]]);
		const result = checkUserPermission(
			user,
			{ resource: "users", action: "read" },
			undefined,
			map,
		);
		expect(result.hasPermission).toBe(false);
	});

	it("matches scope when requiredPermission.scope is specified", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [
					makeRole("r-1", "Staff", [
						{
							resource: "users",
							actions: ["read"],
							scope: "own",
						},
					]),
				]),
			],
		});
		// Correct scope matches
		expect(
			checkUserPermission(user, { resource: "users", action: "read", scope: "own" }).hasPermission,
		).toBe(true);
		// Wrong scope does not match
		expect(
			checkUserPermission(user, { resource: "users", action: "read", scope: "organization" }).hasPermission,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// checkUserRole
// ---------------------------------------------------------------------------

describe("checkUserRole", () => {
	it("returns hasPermission: false for null user", () => {
		const result = checkUserRole(null, "admin");
		expect(result.hasPermission).toBe(false);
	});

	it("returns hasPermission: true when user has the exact role name", () => {
		const user = makeUser({
			organizations: [makeOrg("org-1", [makeRole("r-1", "admin")])],
		});
		expect(checkUserRole(user, "admin").hasPermission).toBe(true);
	});

	it("returns hasPermission: false when role name does not match", () => {
		const user = makeUser({
			organizations: [makeOrg("org-1", [makeRole("r-1", "staff")])],
		});
		expect(checkUserRole(user, "admin").hasPermission).toBe(false);
	});

	it("is case-SENSITIVE (unlike hasRole in the hook which is case-insensitive)", () => {
		const user = makeUser({
			organizations: [makeOrg("org-1", [makeRole("r-1", "Admin")])],
		});
		// Exact match works
		expect(checkUserRole(user, "Admin").hasPermission).toBe(true);
		// Different case does NOT match (pure function, no normalisation)
		expect(checkUserRole(user, "admin").hasPermission).toBe(false);
	});

	it("filters to organizationId when provided", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [makeRole("r-1", "admin")]),
				makeOrg("org-2", [makeRole("r-2", "staff")]),
			],
		});
		// Role is in org-1, not org-2
		expect(checkUserRole(user, "admin", "org-1").hasPermission).toBe(true);
		expect(checkUserRole(user, "admin", "org-2").hasPermission).toBe(false);
	});

	it("checks all orgs when organizationId is not provided", () => {
		const user = makeUser({
			organizations: [
				makeOrg("org-1", [makeRole("r-1", "staff")]),
				makeOrg("org-2", [makeRole("r-2", "admin")]),
			],
		});
		// admin exists in org-2, so should match without org filter
		expect(checkUserRole(user, "admin").hasPermission).toBe(true);
	});

	it("returns hasPermission: false for a user with no organizations", () => {
		const user = makeUser({ organizations: [] });
		expect(checkUserRole(user, "admin").hasPermission).toBe(false);
	});
});
