/**
 * Admin Service
 *
 * Platform admin helpers for role lookup, user-role mirroring,
 * and impersonation support. All helpers accept `controlPanelDb`
 * as their first parameter — no singleton import — so they are
 * compatible with Cloudflare Workers request-scoped connection pools.
 */

import { eq, and } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { user } from "@avantej-core/db/schema/auth";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// New helpers (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a platform admin row by user id.
 * Returns the row (with role) or null if the user is not a platform admin.
 */
export async function getPlatformAdmin(
	controlPanelDb: ControlPanelDb,
	userId: string,
) {
	const row = await controlPanelDb.query.platformAdmins.findFirst({
		where: eq(platformAdmins.userId, userId),
	});
	return row ?? null;
}

/**
 * Mirror platform_admins membership into user.role for the Better-Auth admin plugin.
 * Sets user.role = 'admin' if the user is a platform admin, otherwise null.
 * Called from grantPlatformAdmin / revokePlatformAdmin procedures.
 */
export async function syncUserRole(
	controlPanelDb: ControlPanelDb,
	userId: string,
): Promise<void> {
	const adminRow = await getPlatformAdmin(controlPanelDb, userId);
	await controlPanelDb
		.update(user)
		.set({ role: adminRow ? "admin" : null, updatedAt: new Date() })
		.where(eq(user.id, userId));
}

/**
 * Pick a deterministic target organization for platform-admin impersonation.
 * Returns the earliest active organization_members.organizationId for the user, or null.
 */
export async function getFirstActiveOrgForUser(
	controlPanelDb: ControlPanelDb,
	userId: string,
): Promise<string | null> {
	const row = await controlPanelDb.query.organizationMembers.findFirst({
		where: and(
			eq(organizationMembers.userId, userId),
			eq(organizationMembers.status, "active"),
		),
		orderBy: (om, { asc }) => [asc(om.joinedAt)],
	});
	return row?.organizationId ?? null;
}
