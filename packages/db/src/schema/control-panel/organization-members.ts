/**
 * Control Panel Organization Members Schema
 * 
 * Registry of user memberships in organizations. Enables fast lookup of 
 * "which organizations does this user belong to?" without querying tenant databases.
 * 
 * This is a cache/registry table for fast routing - tenant DB `members` table is source of truth.
 * Role and status must be kept in sync with tenant database via MembershipService.
 */

import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";

export const organizationMembers = pgTable("organization_members", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	role: text("role").notNull(), // admin, trainer, staff, client
	status: text("status").notNull(), // active, suspended
	joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
	// Composite unique constraint: one membership per user per organization
	userOrgUniqueIdx: uniqueIndex("org_members_user_org_idx").on(table.userId, table.organizationId),
	// Indexes for performance
	userIdIdx: index("org_members_user_idx").on(table.userId),
	organizationIdIdx: index("org_members_org_idx").on(table.organizationId),
	statusIdx: index("org_members_status_idx").on(table.status),
}));

