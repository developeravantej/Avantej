/**
 * Control Panel Admin Session Actions Schema
 *
 * Per-action audit log for admin (impersonation) sessions. Every action
 * an admin takes during an active impersonation session should be recorded
 * here for compliance / forensic review.
 *
 * Cascades:
 * - admin_session_id → admin_sessions(id) ON DELETE CASCADE
 *   (if the session row is deleted, its actions go with it)
 * - target_organization_id → organizations(id) ON DELETE SET NULL
 *   (preserve audit history even if the org is later deleted)
 * - target_user_id is plain text (Better-Auth user id) — no FK so the
 *   audit trail survives user deletion (immutable history)
 */

import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { adminSessions } from "./admin-sessions";
import { organizations } from "./organizations";

export const adminSessionActions = pgTable("admin_session_actions", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Nullable: direct platform-admin actions (E.3 lifecycle ops, E.5 comms)
	// happen outside an impersonation session and use admin_user_id instead.
	adminSessionId: uuid("admin_session_id")
		.references(() => adminSessions.id, { onDelete: "cascade" }),
	// Direct actor (Better-Auth user id). Plain text, no FK — audit survives
	// user deletion, mirroring target_user_id.
	adminUserId: text("admin_user_id"),
	actionType: text("action_type").notNull(), // e.g. impersonate, tenant_suspend, tenant_resume
	targetOrganizationId: uuid("target_organization_id")
		.references(() => organizations.id, { onDelete: "set null" }),
	targetUserId: text("target_user_id"),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	sessionIdx: index("admin_session_actions_session_idx").on(table.adminSessionId),
	adminUserIdx: index("admin_session_actions_admin_user_idx").on(table.adminUserId),
	targetOrgIdx: index("admin_session_actions_target_org_idx").on(table.targetOrganizationId),
}));
