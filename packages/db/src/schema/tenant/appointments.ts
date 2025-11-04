/**
 * Tenant Appointments Schema
 * 
 * Represents individual appointment bookings, including type, time, location, service, status, and payment tracking.
 * 
 * Business Rules:
 * - endTime is calculated: startTime + duration
 * - Private appointments have maxAttendees = 1
 * - Semi-private appointments have maxAttendees > 1
 * - Recurring appointments link via recurringParentId
 * - Conflict resolution allows manual override of booking conflicts
 * - Payment status tracks Stripe PaymentIntent lifecycle
 */

import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { services } from "./services";

export const appointments = pgTable("appointments", {
	id: uuid("id").primaryKey().defaultRandom(),
	type: text("type").notNull(), // "private" | "semi-private"
	startTime: timestamp("start_time").notNull(),
	duration: integer("duration").notNull(), // Duration in minutes
	endTime: timestamp("end_time").notNull(), // Calculated: startTime + duration
	
	serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
	branchId: uuid("branch_id")
		.notNull()
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	
	status: text("status").notNull(), // "pending" | "confirmed" | "completed" | "cancelled" | "no-show"
	sessionTotal: integer("session_total").notNull(), // Total pre-tax revenue (pricePerClient × clientCount)
	pricePerClient: integer("price_per_client").notNull(), // Price per client (in cents)
	
	// Recurring appointment support
	isRecurring: boolean("is_recurring").default(false).notNull(),
	recurringParentId: uuid("recurring_parent_id").references((): any => appointments.id, { onDelete: "cascade" }), // Self-reference for recurring series
	recurringFrequency: text("recurring_frequency"), // "daily" | "weekly" | "custom"
	recurringEndDate: timestamp("recurring_end_date"),
	
	// Conflict resolution
	conflictResolved: boolean("conflict_resolved").default(false).notNull(),
	conflictReason: text("conflict_reason"),
	
	// Payment tracking
	paymentStatus: text("payment_status").default("pending").notNull(), // "pending" | "paid" | "partial" | "refunded"
	stripePaymentIntentId: text("stripe_payment_intent_id"), // Stripe PaymentIntent ID for this appointment
	
	notes: text("notes"),
	createdBy: text("created_by").notNull(), // References members.userId (staff/admin who created)
	
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	branchIdIdx: index("appointments_branch_idx").on(table.branchId),
	serviceIdIdx: index("appointments_service_idx").on(table.serviceId),
	startTimeIdx: index("appointments_start_time_idx").on(table.startTime),
	statusIdx: index("appointments_status_idx").on(table.status),
	typeIdx: index("appointments_type_idx").on(table.type),
	recurringParentIdIdx: index("appointments_recurring_idx").on(table.recurringParentId),
	stripePaymentIntentIdIdx: index("appointments_stripe_payment_idx").on(table.stripePaymentIntentId),
	startTimeStatusIdx: index("appointments_start_time_status_idx").on(table.startTime, table.status),
}));

