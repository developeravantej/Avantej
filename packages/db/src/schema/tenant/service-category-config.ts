/**
 * Tenant Service Category Config Schema
 *
 * Booking rule configuration per category.
 * 1:1 relationship with service_categories.
 * Commission configuration has moved to category_commission_configs.
 */

import {
	pgTable,
	uuid,
	integer,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { serviceCategories } from "./service-categories";

export const serviceCategoryConfig = pgTable(
	"service_category_config",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		categoryId: uuid("category_id")
			.notNull()
			.unique()
			.references(() => serviceCategories.id, { onDelete: "cascade" }),

		// Default values for services in this category
		defaultDuration: integer("default_duration"),
		defaultMaxAttendees: integer("default_max_attendees"),

		// Booking rules
		requireAdvanceBooking: boolean("require_advance_booking")
			.default(false)
			.notNull(),
		minAdvanceHours: integer("min_advance_hours"),

		// Cancellation rules
		enableCancellationWindow: boolean("enable_cancellation_window")
			.default(false)
			.notNull(),
		cancellationCutoffHours: integer("cancellation_cutoff_hours"),

		// Buffer time between consecutive bookings (in minutes)
		bufferTimeMinutes: integer("buffer_time_minutes").default(0).notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		categoryIdIdx: index("service_category_config_category_idx").on(
			table.categoryId,
		),
	}),
);
