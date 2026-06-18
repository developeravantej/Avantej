// packages/db/src/schema/tenant/class-slots.ts

/**
 * Tenant Class Slots Schema
 *
 * Pre-defined class schedules with capacity tracking.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { services } from "./services";
import { hierarchyNodes } from "./hierarchy";
import { members } from "./members";

export const classSlots = pgTable(
	"class_slots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		serviceId: uuid("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "cascade" }),
		branchId: uuid("branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "restrict" }),

		// Schedule
		date: timestamp("date").notNull(),
		startTime: text("start_time").notNull(), // "09:00"
		endTime: text("end_time").notNull(),

		// Capacity
		capacity: integer("capacity").notNull(),
		spotsBooked: integer("spots_booked").default(0).notNull(),
		spotsAvailable: integer("spots_available").notNull(),

		// Status
		isFull: boolean("is_full").default(false).notNull(),
		isAvailable: boolean("is_available").default(true).notNull(),
		isCancelled: boolean("is_cancelled").default(false).notNull(),
		cancellationReason: text("cancellation_reason"),

		// Instructor override
		instructorId: uuid("instructor_id").references(() => members.id, {
			onDelete: "set null",
		}),

		location: text("location"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		serviceIdIdx: index("class_slots_service_idx").on(table.serviceId),
		branchIdIdx: index("class_slots_branch_idx").on(table.branchId),
		dateIdx: index("class_slots_date_idx").on(table.date),
		serviceDateTimeIdx: index("class_slots_service_date_time_idx").on(
			table.serviceId,
			table.date,
			table.startTime,
		),
		availableIdx: index("class_slots_available_idx").on(
			table.isAvailable,
			table.isFull,
			table.date,
		),
		instructorIdx: index("class_slots_instructor_idx").on(table.instructorId),
	}),
);
