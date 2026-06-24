import { useReducer, useMemo } from "react";
import type { Role } from "@/components/access-control/permission-matrix/permission-matrix.types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type PermissionScope =
	| "own"
	| "team"
	| "organization"
	| "country"
	| "region"
	| "area"
	| "branch";

export type ViewMode = "matrix" | "roles" | "compact";
export type RoleGroup = "all" | "admin" | "manager" | "user";

export interface PermissionMatrixState {
	viewMode: ViewMode;
	roleFilter: RoleGroup;
	searchQuery: string;
	expandedResources: Set<string>;
	visibleRoleStart: number;
	selectedBatchRoles: Set<string>;
}

export type PermissionMatrixAction =
	| { type: "SET_VIEW_MODE"; viewMode: ViewMode }
	| { type: "SET_ROLE_FILTER"; roleFilter: RoleGroup }
	| { type: "SET_SEARCH_QUERY"; searchQuery: string }
	| { type: "TOGGLE_RESOURCE"; resourceId: string }
	| { type: "SET_VISIBLE_ROLE_START"; visibleRoleStart: number }
	| { type: "TOGGLE_BATCH_ROLE"; roleId: string }
	| { type: "CLEAR_BATCH_ROLES" };

// -----------------------------------------------------------------------------
// Reducer (pure)
// -----------------------------------------------------------------------------

export function permissionMatrixReducer(
	state: PermissionMatrixState,
	action: PermissionMatrixAction,
): PermissionMatrixState {
	switch (action.type) {
		case "SET_VIEW_MODE":
			return { ...state, viewMode: action.viewMode };
		case "SET_ROLE_FILTER":
			return { ...state, roleFilter: action.roleFilter };
		case "SET_SEARCH_QUERY":
			return { ...state, searchQuery: action.searchQuery };
		case "TOGGLE_RESOURCE": {
			const next = new Set(state.expandedResources);
			if (next.has(action.resourceId)) next.delete(action.resourceId);
			else next.add(action.resourceId);
			return { ...state, expandedResources: next };
		}
		case "SET_VISIBLE_ROLE_START":
			return { ...state, visibleRoleStart: action.visibleRoleStart };
		case "TOGGLE_BATCH_ROLE": {
			const next = new Set(state.selectedBatchRoles);
			if (next.has(action.roleId)) next.delete(action.roleId);
			else next.add(action.roleId);
			return { ...state, selectedBatchRoles: next };
		}
		case "CLEAR_BATCH_ROLES":
			return { ...state, selectedBatchRoles: new Set<string>() };
		default:
			return state;
	}
}

// -----------------------------------------------------------------------------
// Pure selectors
// -----------------------------------------------------------------------------

/** Whether `roleId` has any permission for `resourceId` + `actionId`. */
export function hasPermission(
	roles: Role[],
	roleId: string,
	resourceId: string,
	actionId: string,
): boolean {
	const role = roles.find((r) => r.id === roleId);
	return (
		role?.permissions.some(
			(p) => p.resourceId === resourceId && p.actionId === actionId,
		) ?? false
	);
}

/** The scope (if any) of `roleId`'s permission for `resourceId` + `actionId`. */
export function getPermissionScope(
	roles: Role[],
	roleId: string,
	resourceId: string,
	actionId: string,
): PermissionScope | undefined {
	const role = roles.find((r) => r.id === roleId);
	return role?.permissions.find(
		(p) => p.resourceId === resourceId && p.actionId === actionId,
	)?.scope;
}

/**
 * Compute the next state for a toggle: no-access → own → team → organization → no-access.
 * Returns `{ enabled, scope }` to feed `onPermissionChange`.
 */
export function cycleScope(currentScope: PermissionScope | undefined): {
	enabled: boolean;
	scope: PermissionScope | null;
} {
	if (currentScope === undefined) return { enabled: true, scope: "own" };
	if (currentScope === "own") return { enabled: true, scope: "team" };
	if (currentScope === "team") return { enabled: true, scope: "organization" };
	if (currentScope === "organization") return { enabled: false, scope: null };
	// Any higher-tier scope (country/region/area/branch) cycles off.
	return { enabled: false, scope: null };
}

/** Convert the Select's raw string value to a typed scope ("null" → null). */
export function parseScopeValue(raw: string): {
	enabled: boolean;
	scope: PermissionScope | null;
} {
	if (raw === "null") return { enabled: false, scope: null };
	return { enabled: true, scope: raw as PermissionScope };
}

// -----------------------------------------------------------------------------
// Hook — wraps the pure reducer
// -----------------------------------------------------------------------------

export interface UsePermissionMatrixStateOptions {
	initialViewMode: ViewMode;
	initialExpandedResources?: string[];
}

export function usePermissionMatrixState({
	initialViewMode,
	initialExpandedResources = ["users"],
}: UsePermissionMatrixStateOptions) {
	const initial: PermissionMatrixState = useMemo(
		() => ({
			viewMode: initialViewMode,
			roleFilter: "all",
			searchQuery: "",
			expandedResources: new Set(initialExpandedResources),
			visibleRoleStart: 0,
			selectedBatchRoles: new Set<string>(),
		}),
		// intentional: init-only useMemo; adding deps would reset permission matrix state on every render
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	const [state, dispatch] = useReducer(permissionMatrixReducer, initial);

	return { state, dispatch } as const;
}
