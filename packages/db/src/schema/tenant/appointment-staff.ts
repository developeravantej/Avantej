/**
 * Tenant Appointment Staff Schema
 *
 * Links staff members to appointments.
 *
 * Business Rules:
 * - One staff member can only be assigned once per appointment (enforced by unique index)
 * - Staff assignments determine commission splits
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { appointments } from "./appointments";

export const appointmentStaff = pgTable(
	"appointment_staff",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		appointmentId: uuid("appointment_id")
			.notNull()
			.references(() => appointments.id, { onDelete: "cascade" }),
		staffId: text("staff_id").notNull(), // References members.userId
		slotIndex: integer("slot_index"), // 0-based; maps to commission_coach_slots.slotIndex
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => ({
		appointmentStaffUniqueIdx: uniqueIndex("appointment_staff_unique_idx").on(
			table.appointmentId,
			table.staffId,
		),
		appointmentIdIdx: index("appointment_staff_appointment_idx").on(
			table.appointmentId,
		),
		staffIdIdx: index("appointment_staff_staff_idx").on(table.staffId),
	}),
);
