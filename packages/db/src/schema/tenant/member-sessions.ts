/**
 * Member Sessions Schema
 *
 * Audit table for tenant-admin impersonation sessions.
 * Records every start/stop of a tenant admin impersonating a staff member
 * within their own organization.
 *
 * Design decisions:
 * - adminMemberId / impersonatedMemberId: intra-tenant FKs (within same tenant DB)
 * - adminUserId / impersonatedUserId: cross-DB user IDs (control-panel users.id),
 *   stored as text with no FK constraint per Phase 2S cross-DB convention
 * - sessionToken: the Better-Auth session token for the impersonation session;
 *   used to close the row on stopImpersonating
 * - endedAt nullable: NULL means the session is still active
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { members } from "./members";

export const memberSessions = pgTable(
	"member_sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		adminMemberId: uuid("admin_member_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),
		impersonatedMemberId: uuid("impersonated_member_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),
		// Cross-DB user ID mirrors (no FK — cross-DB, per Phase 2S convention)
		adminUserId: text("admin_user_id").notNull(),
		impersonatedUserId: text("impersonated_user_id").notNull(),
		sessionToken: text("session_token").notNull().unique(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		endedAt: timestamp("ended_at", { withTimezone: true }),
	},
	(table) => ({
		adminMemberIdx: index("member_sessions_admin_idx").on(table.adminMemberId),
		activeIdx: index("member_sessions_active_idx")
			.on(table.endedAt)
			.where(sql`${table.endedAt} IS NULL`),
	}),
);
