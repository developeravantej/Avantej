// packages/db/src/schema/tenant/coach-intake-exceptions.ts

/**
 * Tenant Coach Intake Exceptions Schema
 *
 * Date-specific exceptions that block/claim a recurring intake slot.
 * Used to mark a slot as booked/unavailable for a particular date.
 */

import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { members } from "./members";

export const coachIntakeExceptions = pgTable("coach_intake_exceptions", {
	id: uuid("id").primaryKey().defaultRandom(),

	trainerId: uuid("trainer_id")
		.notNull()
		.references(() => members.id, { onDelete: "cascade" }),

	date: timestamp("date", { withTimezone: true }).notNull(), // specific date this exception applies to
	startTime: text("start_time").notNull(), // HH:MM — matches the recurring slot
	endTime: text("end_time").notNull(), // HH:MM — matches the recurring slot
	reason: text("reason"), // optional note (e.g., "Booked for Client X")

	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	trainerDateIdx: index("coach_intake_exc_trainer_date_idx").on(table.trainerId, table.date),
	trainerDateTimeUnique: unique("coach_intake_exc_unique").on(
		table.trainerId,
		table.date,
		table.startTime,
		table.endTime,
	),
}));

export const coachIntakeExceptionsRelations = relations(coachIntakeExceptions, ({ one }) => ({
	trainer: one(members, {
		fields: [coachIntakeExceptions.trainerId],
		references: [members.id],
	}),
}));
