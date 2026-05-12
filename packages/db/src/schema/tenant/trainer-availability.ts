// packages/db/src/schema/tenant/trainer-availability.ts

/**
 * Tenant Trainer Availability Schema
 *
 * Recurring weekly availability windows for trainer members.
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { members } from "./members";

export const trainerAvailability = pgTable("trainer_availability", {
	id: uuid("id").primaryKey().defaultRandom(),

	trainerId: uuid("trainer_id")
		.notNull()
		.references(() => members.id, { onDelete: "cascade" }),

	dayOfWeek: text("day_of_week").notNull(), // "monday" - "sunday"
	startTime: text("start_time").notNull(), // "09:00"
	endTime: text("end_time").notNull(), // "17:00"
	isActive: boolean("is_active").default(true).notNull(),

	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	trainerIdIdx: index("trainer_availability_trainer_id_idx")
		.on(table.trainerId),
	trainerDayIdx: index("trainer_availability_trainer_day_idx")
		.on(table.trainerId, table.dayOfWeek),
}));

export const trainerAvailabilityRelations = relations(trainerAvailability, ({ one }) => ({
	trainer: one(members, {
		fields: [trainerAvailability.trainerId],
		references: [members.id],
	}),
}));
