// packages/db/src/schema/tenant/coach-intake-availability.ts

/**
 * Tenant Coach Intake Availability Schema
 *
 * Intake-specific recurring weekly availability windows for coach members.
 * Separate from trainer_availability (general schedule).
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { members } from "./members";

export const coachIntakeAvailability = pgTable("coach_intake_availability", {
	id: uuid("id").primaryKey().defaultRandom(),

	trainerId: uuid("trainer_id")
		.notNull()
		.references(() => members.id, { onDelete: "cascade" }),

	dayOfWeek: text("day_of_week").notNull(), // "monday" through "sunday"
	startTime: text("start_time").notNull(), // HH:MM format
	endTime: text("end_time").notNull(), // HH:MM format
	isActive: boolean("is_active").default(true).notNull(),

	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	trainerIdx: index("coach_intake_trainer_idx").on(table.trainerId),
	trainerDayIdx: index("coach_intake_trainer_day_idx").on(table.trainerId, table.dayOfWeek),
}));

export const coachIntakeAvailabilityRelations = relations(coachIntakeAvailability, ({ one }) => ({
	trainer: one(members, {
		fields: [coachIntakeAvailability.trainerId],
		references: [members.id],
	}),
}));
