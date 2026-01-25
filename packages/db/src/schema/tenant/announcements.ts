// packages/db/src/schema/tenant/announcements.ts

/**
 * Tenant Announcements Schema
 *
 * System announcements for dashboard widget.
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const announcements = pgTable("announcements", {
	id: uuid("id").primaryKey().defaultRandom(),

	branchId: uuid("branch_id")
		.references(() => hierarchyNodes.id, { onDelete: "cascade" }),

	title: text("title").notNull(),
	message: text("message").notNull(),

	priority: text("priority").default("normal").notNull(), // "low" | "normal" | "high" | "urgent"
	targetAudience: text("target_audience").default("all").notNull(), // "all" | "staff" | "clients"

	startDate: timestamp("start_date"),
	endDate: timestamp("end_date"),

	isActive: boolean("is_active").default(true).notNull(),
	isPinned: boolean("is_pinned").default(false).notNull(),

	createdBy: text("created_by").notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	branchIdIdx: index("announcements_branch_idx").on(table.branchId),
	isActiveIdx: index("announcements_active_idx").on(table.isActive),
	priorityIdx: index("announcements_priority_idx").on(table.priority),
	targetAudienceIdx: index("announcements_target_idx").on(table.targetAudience),
	dateRangeIdx: index("announcements_date_range_idx")
		.on(table.startDate, table.endDate),
	activeVisibleIdx: index("announcements_active_visible_idx")
		.on(table.isActive, table.startDate, table.endDate),
}));
