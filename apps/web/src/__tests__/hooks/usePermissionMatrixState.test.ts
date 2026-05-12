import { describe, test, expect } from "vitest";
import {
	permissionMatrixReducer,
	hasPermission,
	getPermissionScope,
	cycleScope,
	parseScopeValue,
	type PermissionMatrixState,
} from "@/hooks/usePermissionMatrixState";
import type { Role } from "@/components/access-control/permission-matrix/PermissionMatrix";

const EMPTY_STATE: PermissionMatrixState = {
	viewMode: "matrix",
	roleFilter: "all",
	searchQuery: "",
	expandedResources: new Set<string>(),
	visibleRoleStart: 0,
	selectedBatchRoles: new Set<string>(),
};

const ROLES: Role[] = [
	{
		id: "r1",
		name: "R1",
		priority: 1,
		permissions: [
			{ resourceId: "users", actionId: "read", scope: "own" },
			{ resourceId: "users", actionId: "update", scope: "team" },
			{ resourceId: "roles", actionId: "read", scope: "organization" },
		],
	},
];

// -----------------------------------------------------------------------------
// Reducer
// -----------------------------------------------------------------------------

describe("permissionMatrixReducer", () => {
	test("SET_VIEW_MODE updates viewMode", () => {
		const next = permissionMatrixReducer(EMPTY_STATE, {
			type: "SET_VIEW_MODE",
			viewMode: "compact",
		});
		expect(next.viewMode).toBe("compact");
		// Other fields unchanged.
		expect(next.searchQuery).toBe(EMPTY_STATE.searchQuery);
	});

	test("SET_ROLE_FILTER updates roleFilter", () => {
		const next = permissionMatrixReducer(EMPTY_STATE, {
			type: "SET_ROLE_FILTER",
			roleFilter: "admin",
		});
		expect(next.roleFilter).toBe("admin");
	});

	test("SET_SEARCH_QUERY updates searchQuery", () => {
		const next = permissionMatrixReducer(EMPTY_STATE, {
			type: "SET_SEARCH_QUERY",
			searchQuery: "ops",
		});
		expect(next.searchQuery).toBe("ops");
	});

	test("TOGGLE_RESOURCE adds and removes a resource from the expanded set", () => {
		const opened = permissionMatrixReducer(EMPTY_STATE, {
			type: "TOGGLE_RESOURCE",
			resourceId: "users",
		});
		expect(opened.expandedResources.has("users")).toBe(true);

		const closed = permissionMatrixReducer(opened, {
			type: "TOGGLE_RESOURCE",
			resourceId: "users",
		});
		expect(closed.expandedResources.has("users")).toBe(false);
	});

	test("TOGGLE_BATCH_ROLE adds and removes a role id", () => {
		const added = permissionMatrixReducer(EMPTY_STATE, {
			type: "TOGGLE_BATCH_ROLE",
			roleId: "r1",
		});
		expect(added.selectedBatchRoles.has("r1")).toBe(true);

		const removed = permissionMatrixReducer(added, {
			type: "TOGGLE_BATCH_ROLE",
			roleId: "r1",
		});
		expect(removed.selectedBatchRoles.has("r1")).toBe(false);
	});

	test("CLEAR_BATCH_ROLES empties the batch set", () => {
		const seeded = permissionMatrixReducer(EMPTY_STATE, {
			type: "TOGGLE_BATCH_ROLE",
			roleId: "r1",
		});
		const cleared = permissionMatrixReducer(seeded, {
			type: "CLEAR_BATCH_ROLES",
		});
		expect(cleared.selectedBatchRoles.size).toBe(0);
	});

	test("SET_VISIBLE_ROLE_START updates the pagination pointer", () => {
		const next = permissionMatrixReducer(EMPTY_STATE, {
			type: "SET_VISIBLE_ROLE_START",
			visibleRoleStart: 6,
		});
		expect(next.visibleRoleStart).toBe(6);
	});

	test("reducer does not mutate the previous state", () => {
		const before = { ...EMPTY_STATE, expandedResources: new Set(["a"]) };
		permissionMatrixReducer(before, {
			type: "TOGGLE_RESOURCE",
			resourceId: "b",
		});
		expect(before.expandedResources.has("b")).toBe(false);
		expect(before.expandedResources.has("a")).toBe(true);
	});
});

// -----------------------------------------------------------------------------
// Selectors
// -----------------------------------------------------------------------------

describe("hasPermission / getPermissionScope", () => {
	test("hasPermission returns true for a known grant", () => {
		expect(hasPermission(ROLES, "r1", "users", "read")).toBe(true);
	});

	test("hasPermission returns false for an unknown grant", () => {
		expect(hasPermission(ROLES, "r1", "users", "delete")).toBe(false);
	});

	test("getPermissionScope returns the assigned scope", () => {
		expect(getPermissionScope(ROLES, "r1", "users", "update")).toBe("team");
	});

	test("getPermissionScope returns undefined when no permission is found", () => {
		expect(getPermissionScope(ROLES, "r1", "users", "delete")).toBeUndefined();
	});
});

// -----------------------------------------------------------------------------
// Cycle logic
// -----------------------------------------------------------------------------

describe("cycleScope", () => {
	test("no-access → own", () => {
		expect(cycleScope(undefined)).toEqual({ enabled: true, scope: "own" });
	});

	test("own → team", () => {
		expect(cycleScope("own")).toEqual({ enabled: true, scope: "team" });
	});

	test("team → organization", () => {
		expect(cycleScope("team")).toEqual({
			enabled: true,
			scope: "organization",
		});
	});

	test("organization → no-access (null)", () => {
		expect(cycleScope("organization")).toEqual({
			enabled: false,
			scope: null,
		});
	});

	test("branch (hierarchy scope) → no-access (null)", () => {
		expect(cycleScope("branch")).toEqual({ enabled: false, scope: null });
	});
});

describe("parseScopeValue", () => {
	test("literal 'null' → disabled", () => {
		expect(parseScopeValue("null")).toEqual({ enabled: false, scope: null });
	});

	test("scope string → enabled with that scope", () => {
		expect(parseScopeValue("team")).toEqual({ enabled: true, scope: "team" });
	});
});
