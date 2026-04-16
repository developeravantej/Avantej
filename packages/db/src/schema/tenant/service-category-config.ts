/**
 * Tenant Service Category Config Schema
 *
 * Commission, incentive, and booking rule configuration per category.
 * 1:1 relationship with service_categories.
 */

import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { serviceCategories } from "./service-categories";

export const serviceCategoryConfig = pgTable("service_category_config", {
	id: uuid("id").primaryKey().defaultRandom(),
	categoryId: uuid("category_id")
		.notNull()
		.unique()
		.references(() => serviceCategories.id, { onDelete: "cascade" }),

	// Default values for services in this category
	defaultDuration: integer("default_duration"),
	defaultMaxAttendees: integer("default_max_attendees"),

	// Commission/incentive config
	incentiveType: text("incentive_type"), // "fixed" | "variable"
	isConditional: boolean("is_conditional").default(false).notNull(),
	maxStaff: integer("max_staff").default(1).notNull(),
	staffPoolPercentage: integer("staff_pool_percentage").default(100).notNull(),
	staffWeightage: jsonb("staff_weightage").$type<Array<{ position: number; percentage: number; title?: string }> | null>(),
	paymentStructures: jsonb("payment_structures").$type<Record<string, unknown> | null>(),
	threshold: integer("threshold"),

	// Booking rules
	requireAdvanceBooking: boolean("require_advance_booking").default(false).notNull(),
	minAdvanceHours: integer("min_advance_hours"),

	// Cancellation rules
	enableCancellationWindow: boolean("enable_cancellation_window").default(false).notNull(),
	cancellationCutoffHours: integer("cancellation_cutoff_hours"),

	// Buffer time between consecutive bookings (in minutes)
	bufferTimeMinutes: integer("buffer_time_minutes").default(0).notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	categoryIdIdx: index("service_category_config_category_idx").on(table.categoryId),
	incentiveTypeIdx: index("service_category_config_incentive_idx").on(table.incentiveType),
}));
