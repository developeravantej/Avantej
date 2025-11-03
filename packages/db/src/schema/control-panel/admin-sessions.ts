/**
 * Control Panel Admin Sessions Schema
 * 
 * Tracks Avantej platform admin impersonation sessions for audit trail.
 * All actions during impersonation are logged with both admin and impersonated user IDs.
 * 
 * Impersonation sessions:
 * - Maximum duration: 1 hour (configured in Better-Auth)
 * - Admin can exit impersonation early
 * - All actions logged for compliance audit
 */

import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

export const adminSessions = pgTable("admin_sessions", {
	id: uuid("id").primaryKey().defaultRandom(),
	adminUserId: text("admin_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	impersonatedUserId: text("impersonated_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	organizationId: uuid("organization_id")
		.references(() => organizations.id, { onDelete: "set null" }),
	sessionToken: text("session_token").notNull().unique(),
	startedAt: timestamp("started_at").defaultNow().notNull(),
	endedAt: timestamp("ended_at"),
}, (table) => ({
	// Indexes for performance
	// Note: sessionToken already has unique constraint/index via .unique()
	adminUserIdIdx: index("admin_sessions_admin_idx").on(table.adminUserId),
	// Partial index for active sessions (ended_at IS NULL)
	activeSessionsIdx: index("admin_sessions_active_idx")
		.on(table.endedAt)
		.where(sql`${table.endedAt} IS NULL`),
}));

