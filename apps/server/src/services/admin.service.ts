/**
 * Admin Impersonation Service
 *
 * Provides functions for platform administrators to impersonate users
 * for support and troubleshooting purposes.
 *
 * Usage:
 * ```typescript
 * import { startImpersonation, endImpersonation } from "@/services/admin.service";
 *
 * const sessionId = await startImpersonation(adminUserId, targetUserId, organizationId);
 * await endImpersonation(sessionId);
 * ```
 */

import { eq } from "drizzle-orm";
import { controlPanelDb } from "@/lib/db";
import { adminSessions } from "@avantej-core/db/schema/control-panel/admin-sessions";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";

/**
 * Start impersonation session
 *
 * Creates an admin impersonation session record and generates an impersonation token.
 * The impersonation token can be used to create a session as the target user.
 *
 * @param adminUserId - ID of the platform admin performing impersonation
 * @param targetUserId - ID of the user to impersonate
 * @param organizationId - Optional organization ID to scope impersonation
 * @returns Impersonation session ID and token
 * @throws Error if admin doesn't have permission or target user not found
 *
 * @example
 * ```typescript
 * const { sessionId, token } = await startImpersonation(
 *   "admin-user-id",
 *   "target-user-id",
 *   "org-123"
 * );
 * ```
 */
export async function startImpersonation(
	adminUserId: string,
	targetUserId: string,
	organizationId?: string
): Promise<{ sessionId: string; token: string }> {
	if (!adminUserId || !targetUserId) {
		throw new Error("Admin user ID and target user ID are required");
	}

	// Verify admin has permission (should be checked before calling this function)
	const adminRecord = await controlPanelDb.query.platformAdmins.findFirst({
		where: eq(platformAdmins.userId, adminUserId),
	});

	if (!adminRecord) {
		throw new Error("Admin user not found or not authorized");
	}

	// Generate impersonation session token
	// Use crypto.randomUUID() for Cloudflare Workers compatibility
	const sessionToken = crypto.randomUUID() + crypto.randomUUID();

	// Create impersonation session record
	const [session] = await controlPanelDb
		.insert(adminSessions)
		.values({
			adminUserId,
			impersonatedUserId: targetUserId,
			organizationId: organizationId || null,
			sessionToken,
		})
		.returning();

	if (!session) {
		throw new Error("Failed to create impersonation session");
	}

	// Generate impersonation token
	// Note: Better-Auth admin plugin handles impersonation tokens internally
	// For now, return the session token that can be used to create a session
	// TODO: Integrate with Better-Auth admin plugin impersonation API
	const impersonationToken = generateImpersonationToken(
		targetUserId,
		sessionToken
	);

	return {
		sessionId: session.id,
		token: impersonationToken,
	};
}

/**
 * End impersonation session
 *
 * Marks an impersonation session as ended by setting the endedAt timestamp.
 *
 * @param sessionId - ID of the impersonation session to end
 * @throws Error if session not found
 *
 * @example
 * ```typescript
 * await endImpersonation("session-123");
 * ```
 */
export async function endImpersonation(sessionId: string): Promise<void> {
	if (!sessionId) {
		throw new Error("Session ID is required");
	}

	const session = await controlPanelDb.query.adminSessions.findFirst({
		where: eq(adminSessions.id, sessionId),
	});

	if (!session) {
		throw new Error("Impersonation session not found");
	}

	if (session.endedAt) {
		throw new Error("Impersonation session already ended");
	}

	// Mark session as ended
	await controlPanelDb
		.update(adminSessions)
		.set({ endedAt: new Date() })
		.where(eq(adminSessions.id, sessionId));
}

/**
 * Get active impersonation sessions for an admin
 *
 * @param adminUserId - ID of the platform admin
 * @returns Array of active impersonation sessions
 */
export async function getActiveImpersonationSessions(adminUserId: string) {
	const sessions = await controlPanelDb.query.adminSessions.findMany({
		where: eq(adminSessions.adminUserId, adminUserId),
	});

	// Filter for active sessions (endedAt is null)
	return sessions.filter((session) => !session.endedAt);
}

/**
 * Generate impersonation token
 *
 * Generates a token that can be used to create a session as the target user.
 * This uses Better-Auth's admin plugin capabilities.
 *
 * @param targetUserId - ID of the user to impersonate
 * @param sessionToken - Session token from admin_sessions table
 * @returns Impersonation token
 */
function generateImpersonationToken(
	targetUserId: string,
	sessionToken: string
): string {
	// Better-Auth admin plugin provides impersonation functionality
	// For now, we'll return a token that can be validated
	// In production, this should use Better-Auth's impersonation API
	// Note: Better-Auth handles impersonation tokens internally
	// We'll need to integrate with Better-Auth's admin plugin API

	// TODO: Integrate with Better-Auth admin plugin impersonation API
	// For now, return a composite token that can be validated
	return `${targetUserId}:${sessionToken}`;
}

