/**
 * Tenant Commission Splits Schema
 * 
 * Stores the calculated commission splits for staff members per appointment.
 * This is calculated based on serviceCommissionConfig and appointmentStaff assignments.
 * 
 * Business Rules:
 * - One commission split per appointment-staff combination (enforced by unique index)
 * - splitPercentage must be between 0-100
 * - calculatedAmount is pre-tax: sessionTotal × splitPercentage / 100
 * - Commission splits are calculated when appointment is confirmed/completed
 */

import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";

export const commissionSplits = pgTable("commission_splits", {
	id: uuid("id").primaryKey().defaultRandom(),
	appointmentId: uuid("appointment_id")
		.notNull()
		.references(() => appointments.id, { onDelete: "cascade" }),
	staffId: text("staff_id").notNull(), // References members.userId
	splitPercentage: integer("split_percentage").notNull(), // 0-100 (stored as integer, e.g., 70 = 70%)
	calculatedAmount: integer("calculated_amount").notNull(), // Pre-tax amount (sessionTotal × splitPercentage / 100) in cents
	notes: text("notes"), // Optional override reason
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	appointmentStaffUniqueIdx: uniqueIndex("commission_splits_unique_idx").on(
		table.appointmentId,
		table.staffId
	),
	appointmentIdIdx: index("commission_splits_appointment_idx").on(table.appointmentId),
	staffIdIdx: index("commission_splits_staff_idx").on(table.staffId),
}));

