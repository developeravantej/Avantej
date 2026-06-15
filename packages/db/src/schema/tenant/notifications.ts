// packages/db/src/schema/tenant/notifications.ts

/**
 * Tenant Notifications Schema
 *
 * User notifications for bookings, payments, promotions, etc.
 */

import {
	pgTable,
	uuid,
	text,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";

export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),

		type: text("type").notNull(), // "booking" | "reminder" | "payment" | "promotion" | "system"
		title: text("title").notNull(),
		message: text("message").notNull(),

		// Visual
		icon: text("icon"),
		color: text("color"),

		// Related entity
		relatedId: uuid("related_id"),
		relatedType: text("related_type"),

		// Status
		isRead: boolean("is_read").default(false).notNull(),
		readAt: timestamp("read_at"),
		emailSentAt: timestamp("email_sent_at", { withTimezone: true }),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("notifications_user_idx").on(table.userId),
		isReadIdx: index("notifications_read_idx").on(table.isRead),
		typeIdx: index("notifications_type_idx").on(table.type),
		userReadCreatedIdx: index("notifications_user_read_created_idx").on(
			table.userId,
			table.isRead,
			table.createdAt,
		),
	}),
);
