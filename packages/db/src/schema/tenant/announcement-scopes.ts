// packages/db/src/schema/tenant/announcement-scopes.ts

/**
 * Tenant Announcement Scopes Schema
 *
 * Agent 2.10 (audit-driven §8.5): junction table allowing a single announcement
 * to target multiple branches. The legacy `announcements.branch_id` column
 * remains as a single-branch shortcut; multi-branch announcements add rows here
 * (and may leave `announcements.branch_id` NULL).
 */

import { pgTable, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { announcements } from "./announcements";
import { hierarchyNodes } from "./hierarchy";

export const announcementScopes = pgTable(
	"announcement_scopes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		announcementId: uuid("announcement_id")
			.notNull()
			.references(() => announcements.id, { onDelete: "cascade" }),
		branchId: uuid("branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "cascade" }),
	},
	(table) => ({
		announcementBranchUniqueIdx: uniqueIndex(
			"announcement_scopes_unique_idx",
		).on(table.announcementId, table.branchId),
	}),
);
