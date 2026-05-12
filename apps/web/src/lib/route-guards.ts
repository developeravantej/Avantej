/**
 * Route Guard Helpers
 *
 * Utilities for checking permissions in route beforeLoad hooks.
 * These work alongside Better-Auth session checks (performed by the parent
 * _authenticated route). Guards here assume the user is already authenticated
 * and only enforce permission / role / system-admin requirements.
 *
 * Design: guards read from the TanStack Query cache (populated by useUserContext)
 * to avoid extra network round-trips on every navigation. On a cold load where
 * the cache is empty they fetch once and the result is stored for subsequent
 * navigations.
 */

import { authClient } from "@/lib/auth-client";
import { client, queryClient } from "@/utils/orpc";
import type { UserContextResponse } from "@/hooks/useUserContext";
import { redirect } from "@tanstack/react-router";

const USER_CONTEXT_QUERY_KEY = ["user-context"];

/**
 * Fetch user context from cache or API.
 *
 * TanStack Query's `fetchQuery` returns cached data when it's still fresh
 * (staleTime 5 minutes), so subsequent navigation hits are free.
 */
async function fetchUserContext(): Promise<UserContextResponse | null> {
	try {
		const data = await queryClient.fetchQuery<UserContextResponse>({
			queryKey: USER_CONTEXT_QUERY_KEY,
			queryFn: () => client.auth.userContext({}) as Promise<UserContextResponse>,
			staleTime: 5 * 60 * 1000, // match the hook's staleTime
		});
		return data ?? null;
	} catch {
		return null;
	}
}

/**
 * Get current org permissions from user context.
 */
function getOrgPermissions(ctx: UserContextResponse): string[] {
	const orgId = ctx.currentOrganizationId;
	const org = orgId
		? ctx.organizations.find((o) => o.id === orgId)
		: ctx.organizations[0];
	return org?.permissions ?? [];
}

/**
 * Get the member's role in the current org.
 */
function getMemberRole(ctx: UserContextResponse): string | null {
	const orgId = ctx.currentOrganizationId;
	const org = orgId
		? ctx.organizations.find((o) => o.id === orgId)
		: ctx.organizations[0];
	return org?.hierarchy?.member?.role ?? null;
}

/**
 * Redirect to the dashboard with an `unauthorized=true` query param so the
 * dashboard can show "Access denied" feedback.
 */
function redirectUnauthorized(redirectTo: string = "/dashboard"): never {
	throw redirect({
		to: redirectTo,
		search: { unauthorized: true } as Record<string, unknown>,
		throw: true,
	});
}

// ---------------------------------------------------------------------------
// Public guard functions
// ---------------------------------------------------------------------------

/**
 * Check if the authenticated user has the required permission in their current
 * organization. Redirects to `redirectTo` with `?unauthorized=true` if not.
 *
 * Permission format: "resource:action" (e.g. "user_management:read").
 */
export async function requirePermission(
	permission: { resource: string; action: string } | string,
	redirectTo: string = "/dashboard"
): Promise<void> {
	// Ensure session exists (belt-and-suspenders; _authenticated route already checks)
	const session = await authClient.getSession();
	if (!session.data) {
		throw redirect({
			to: "/login",
			search: { invitationToken: undefined, orgId: undefined },
			throw: true,
		});
	}

	const permissionKey =
		typeof permission === "string"
			? permission
			: `${permission.resource}:${permission.action}`;

	const ctx = await fetchUserContext();
	if (!ctx) {
		// Could not load user context — fail closed
		redirectUnauthorized(redirectTo);
		return;
	}

	// System admins bypass all permission checks
	if (ctx.isSystemAdmin) return;

	const permissions = getOrgPermissions(ctx);
	if (!permissions.includes(permissionKey)) {
		redirectUnauthorized(redirectTo);
	}
}

/**
 * Check if the authenticated user has at least one of the required permissions.
 * Redirects to `redirectTo` with `?unauthorized=true` if none match.
 */
async function requireAnyPermission(
	permissions: Array<{ resource: string; action: string } | string>,
	redirectTo: string = "/dashboard"
): Promise<void> {
	const session = await authClient.getSession();
	if (!session.data) {
		throw redirect({
			to: "/login",
			search: { invitationToken: undefined, orgId: undefined },
			throw: true,
		});
	}

	const ctx = await fetchUserContext();
	if (!ctx) {
		redirectUnauthorized(redirectTo);
		return;
	}

	if (ctx.isSystemAdmin) return;

	const orgPerms = getOrgPermissions(ctx);
	const permissionKeys = permissions.map((p) =>
		typeof p === "string" ? p : `${p.resource}:${p.action}`
	);

	const hasAny = permissionKeys.some((key) => orgPerms.includes(key));
	if (!hasAny) {
		redirectUnauthorized(redirectTo);
	}
}

/**
 * Check if the authenticated user's role is one of the allowed roles in their
 * current organization. Role comparison is case-insensitive.
 * Redirects to `redirectTo` with `?unauthorized=true` if not.
 */
async function requireRole(
	roleNames: string | string[],
	redirectTo: string = "/dashboard"
): Promise<void> {
	const session = await authClient.getSession();
	if (!session.data) {
		throw redirect({
			to: "/login",
			search: { invitationToken: undefined, orgId: undefined },
			throw: true,
		});
	}

	const ctx = await fetchUserContext();
	if (!ctx) {
		redirectUnauthorized(redirectTo);
		return;
	}

	if (ctx.isSystemAdmin) return;

	const allowed = Array.isArray(roleNames) ? roleNames : [roleNames];
	const memberRole = getMemberRole(ctx)?.toLowerCase() ?? "";
	const hasRole = allowed.some((r) => r.toLowerCase() === memberRole);
	if (!hasRole) {
		redirectUnauthorized(redirectTo);
	}
}

/**
 * Check if the authenticated user is a platform (system) admin.
 * Redirects to `redirectTo` with `?unauthorized=true` if not.
 */
async function requireSystemAdmin(
	redirectTo: string = "/dashboard"
): Promise<void> {
	const session = await authClient.getSession();
	if (!session.data) {
		throw redirect({
			to: "/login",
			search: { invitationToken: undefined, orgId: undefined },
			throw: true,
		});
	}

	const ctx = await fetchUserContext();
	if (!ctx || !ctx.isSystemAdmin) {
		redirectUnauthorized(redirectTo);
	}
}
