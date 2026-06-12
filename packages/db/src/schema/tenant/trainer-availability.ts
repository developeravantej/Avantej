// packages/db/src/schema/tenant/trainer-availability.ts

/**
 * Tenant Trainer Availability Schema
 *
 * Recurring weekly availability windows for trainer members.
 */

import {
	pgTable,
	uuid,
	text,
	boolean,
	timestamp,
	date,
	index,
	uniqueIndex,
	pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { members } from "./members";

export const trainerAvailabilityKindEnum = pgEnum("trainer_availability_kind", [
	"available",
	"blocked",
	"timeoff",
]);

export const trainerAvailability = pgTable(
	"trainer_availability",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		trainerId: uuid("trainer_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),

		dayOfWeek: text("day_of_week").notNull(), // "monday" - "sunday"
		startTime: text("start_time").notNull(), // "09:00"
		endTime: text("end_time").notNull(), // "17:00"
		kind: trainerAvailabilityKindEnum("kind").notNull().default("available"),
		isActive: boolean("is_active").default(true).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		trainerIdIdx: index("trainer_availability_trainer_id_idx").on(
			table.trainerId,
		),
		trainerDayIdx: index("trainer_availability_trainer_day_idx").on(
			table.trainerId,
			table.dayOfWeek,
		),
	}),
);

export const trainerAvailabilityRelations = relations(
	trainerAvailability,
	({ one }) => ({
		trainer: one(members, {
			fields: [trainerAvailability.trainerId],
			references: [members.id],
		}),
	}),
);

/**
 * One-off date-specific exceptions overriding the recurring schedule.
 * Kind is constrained to "blocked" or "timeoff" at the service/router layer
 * (re-uses the shared enum to avoid adding another enum type).
 *
 * createdBy is a control-panel user id (cross-DB), stored as plain text.
 */
export const trainerAvailabilityExceptions = pgTable(
	"trainer_availability_exceptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		trainerId: uuid("trainer_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),

		date: date("date").notNull(),
		kind: trainerAvailabilityKindEnum("kind").notNull().default("timeoff"),
		reason: text("reason"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdBy: text("created_by"),
	},
	(table) => ({
		trainerDateUniq: uniqueIndex(
			"trainer_availability_exc_trainer_date_uniq",
		).on(table.trainerId, table.date),
	}),
);

export const trainerAvailabilityExceptionsRelations = relations(
	trainerAvailabilityExceptions,
	({ one }) => ({
		trainer: one(members, {
			fields: [trainerAvailabilityExceptions.trainerId],
			references: [members.id],
		}),
	}),
);
