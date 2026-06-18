// packages/db/src/schema/tenant/notification-preferences.ts

/**
 * Tenant Notification Preferences Schema
 *
 * User notification settings per organization.
 */

import {
	pgTable,
	uuid,
	text,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";

export const notificationPreferences = pgTable(
	"notification_preferences",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull().unique(),

		// Channel toggles
		emailEnabled: boolean("email_enabled").default(true).notNull(),
		smsEnabled: boolean("sms_enabled").default(false).notNull(),
		pushEnabled: boolean("push_enabled").default(true).notNull(),

		// Notification type toggles
		bookingReminders: boolean("booking_reminders").default(true).notNull(),
		bookingConfirmations: boolean("booking_confirmations")
			.default(true)
			.notNull(),
		promotionalEmails: boolean("promotional_emails").default(true).notNull(),
		packageExpiry: boolean("package_expiry").default(true).notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("notification_preferences_user_idx").on(table.userId),
	}),
);
