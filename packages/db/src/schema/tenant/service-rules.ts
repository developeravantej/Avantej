/**
 * Tenant Service Rules Schema
 * 
 * Defines booking and cancellation rules for services.
 * Duration fields use seconds for flexibility, with unit types for display.
 * 
 * Business Rules:
 * - One rules config per service (1:1 relationship)
 * - Advance booking duration must be positive if requireAdvanceBooking is true
 * - Cancellation cutoff must be positive if enableCancellationWindow is true
 */

import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { services } from "./services";

export const serviceRules = pgTable("service_rules", {
	id: uuid("id").primaryKey().defaultRandom(),
	serviceId: uuid("service_id")
		.notNull()
		.unique()
		.references(() => services.id, { onDelete: "cascade" }),
	
	// Advance booking rules
	requireAdvanceBooking: boolean("require_advance_booking").default(false).notNull(),
	minAdvanceBookingDuration: integer("min_advance_booking_duration"), // Duration in seconds
	minAdvanceBookingUnitType: text("min_advance_booking_unit_type").default("hours"), // "seconds" | "minutes" | "hours" | "days"
	
	// Cancellation rules
	enableCancellationWindow: boolean("enable_cancellation_window").default(false).notNull(),
	cancellationCutoffDuration: integer("cancellation_cutoff_duration"), // Duration in seconds before start time
	cancellationCutoffUnitType: text("cancellation_cutoff_unit_type").default("hours"), // "seconds" | "minutes" | "hours" | "days"
	
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	serviceIdIdx: index("service_rules_service_idx").on(table.serviceId),
}));

