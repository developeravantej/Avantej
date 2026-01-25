// packages/db/src/schema/tenant/user-activity-log.ts

/**
 * Tenant User Activity Log Schema
 *
 * Tracks customer activity for "Recent Activity" dashboard widget.
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const userActivityLog = pgTable("user_activity_log", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: text("user_id").notNull(),

	activityType: text("activity_type").notNull(),
	// "booking_created" | "booking_completed" | "booking_cancelled" |
	// "package_purchased" | "credit_used" | "credit_added"

	title: text("title").notNull(),
	description: text("description"),

	relatedId: uuid("related_id"),
	relatedType: text("related_type"),

	creditsChange: integer("credits_change").default(0).notNull(),
	icon: text("icon"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	userIdIdx: index("user_activity_log_user_idx").on(table.userId),
	activityTypeIdx: index("user_activity_log_type_idx").on(table.activityType),
	userCreatedIdx: index("user_activity_log_user_created_idx")
		.on(table.userId, table.createdAt),
}));
