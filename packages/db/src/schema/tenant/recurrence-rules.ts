// packages/db/src/schema/tenant/recurrence-rules.ts

/**
 * Tenant Recurrence Rules Schema
 *
 * Complex recurrence configuration for recurring appointments.
 * 1:1 relationship with appointments (only for recurring parents).
 */

import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";

export const recurrenceRules = pgTable("recurrence_rules", {
	id: uuid("id").primaryKey().defaultRandom(),
	appointmentId: uuid("appointment_id")
		.notNull()
		.unique()
		.references(() => appointments.id, { onDelete: "cascade" }),

	frequencyValue: integer("frequency_value").notNull().default(1),
	timeUnit: text("time_unit").notNull(), // "day" | "week" | "month"

	// Weekly
	repeatOn: jsonb("repeat_on").$type<number[] | null>(), // [1,3,5] for Mon,Wed,Fri

	// Monthly
	monthlyType: text("monthly_type"), // "day_of_month" | "day_of_week"
	monthlyDayOfWeek: integer("monthly_day_of_week"),
	monthlyWeekOfMonth: integer("monthly_week_of_month"),

	// End conditions
	endsType: text("ends_type").notNull(), // "never" | "on_date" | "after_occurrences"
	endsAfterOccurrences: integer("ends_after_occurrences"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	appointmentIdIdx: index("recurrence_rules_appointment_idx").on(table.appointmentId),
}));
