/**
 * Tenant GoHighLevel User Links Schema
 *
 * Maps Avantej staff (members with role IN ('admin','staff','trainer'))
 * to GoHighLevel User records. Each (member, branch) pair maps to one
 * GHL User in the branch's GHL location.
 */

import {
	index,
	pgTable,
	text,
	timestamp,
	uuid,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const ghlUserLinks = pgTable(
	"ghl_user_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ghlUserId: text("ghl_user_id").notNull(),
		userId: text("user_id").notNull(),
		memberId: uuid("member_id").notNull(),
		branchNodeId: uuid("branch_node_id").notNull(),
		ghlLocationId: text("ghl_location_id").notNull(),
		lastError: text("last_error"),
		syncStatus: text("sync_status").default("active").notNull(),
		lastSyncedAt: timestamp("last_synced_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		ghlUserIdUniqueIdx: uniqueIndex(
			"ghl_user_links_ghl_user_id_unique",
		).on(table.ghlUserId),
		memberBranchUniqueIdx: uniqueIndex(
			"ghl_user_links_member_branch_unique",
		).on(table.memberId, table.branchNodeId),
		userIdIdx: index("ghl_user_links_user_idx").on(table.userId),
		memberIdIdx: index("ghl_user_links_member_idx").on(table.memberId),
		branchNodeIdIdx: index("ghl_user_links_branch_idx").on(
			table.branchNodeId,
		),
		ghlLocationIdIdx: index("ghl_user_links_ghl_location_idx").on(
			table.ghlLocationId,
		),
		syncStatusIdx: index("ghl_user_links_sync_status_idx").on(
			table.syncStatus,
			table.lastSyncedAt,
		),
	}),
);
