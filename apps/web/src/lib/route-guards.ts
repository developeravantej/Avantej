/**
 * Route Guard Helpers
 * 
 * Utilities for checking permissions in route beforeLoad hooks.
 * These work alongside Better-Auth session checks.
 */

import { authClient } from "@/lib/auth-client";
import { redirect } from "@tanstack/react-router";
import type { RequiredPermission } from "@/types/auth";

/**
 * Check if user has required permission
 * 
 * TODO: When permissions API is ready, fetch user permissions and check them here
 * For now, this is a placeholder that checks authentication only
 */
export async function requirePermission(
	permission: RequiredPermission,
	redirectTo: string = "/dashboard"
): Promise<void> {
	const session = await authClient.getSession();
	
	if (!session.data) {
		throw redirect({
			to: "/login",
			throw: true,
		});
	}

	// TODO: Fetch user permissions from API and check them
	// For now, all authenticated users can access routes
	// Permission-based UI hiding is handled by PermissionGate components
	
	// Example future implementation:
	// const userPermissions = await fetchUserPermissions(session.data.user.id);
	// if (!hasPermission(userPermissions, permission)) {
	//   throw redirect({ to: redirectTo, throw: true });
	// }
}

/**
 * Check if user has any of the required permissions
 */
export async function requireAnyPermission(
	permissions: RequiredPermission[],
	redirectTo: string = "/dashboard"
): Promise<void> {
	const session = await authClient.getSession();
	
	if (!session.data) {
		throw redirect({
			to: "/login",
			throw: true,
		});
	}

	// TODO: Implement permission checking when API is ready
}

/**
 * Check if user has a specific role
 */
export async function requireRole(
	roleName: string,
	redirectTo: string = "/dashboard"
): Promise<void> {
	const session = await authClient.getSession();
	
	if (!session.data) {
		throw redirect({
			to: "/login",
			throw: true,
		});
	}

	// TODO: Check user roles when API is ready
}

/**
 * Check if user is system admin
 */
export async function requireSystemAdmin(
	redirectTo: string = "/dashboard"
): Promise<void> {
	const session = await authClient.getSession();
	
	if (!session.data) {
		throw redirect({
			to: "/login",
			throw: true,
		});
	}

	// TODO: Check if user is system admin when API is ready
}




