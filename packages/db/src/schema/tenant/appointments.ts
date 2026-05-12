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

import { pgTable, uuid, text, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { services } from "./services";
import { members } from "./members";
import { packageInstances } from "./package-instances";
import { classSlots } from "./class-slots";
import { rooms } from "./rooms";
import { salesOrders } from "./sales-orders";

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
	// DEPRECATED — never written by new code. Recurrence rules are stored in recurrence_rules table.
	// Kept for backward compatibility. Do not read or write this column from new code.
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

	// ========== NEW FIELDS ==========

	// Booking identifier
	bookingNumber: text("booking_number").unique(),

	// Client booking (for mobile app - direct client bookings)
	userId: text("user_id"),

	// Trainer assignment
	trainerId: uuid("trainer_id")
		.references(() => members.id, { onDelete: "set null" }),

	// Package usage
	packageInstanceId: uuid("package_instance_id")
		.references(() => packageInstances.id, { onDelete: "set null" }),
	creditsUsed: integer("credits_used").default(1),

	// Location
	location: text("location"),

	// Cancellation tracking
	cancelledAt: timestamp("cancelled_at"),
	cancellationReason: text("cancellation_reason"),

	// Class slot reference
	classSlotId: uuid("class_slot_id")
		.references(() => classSlots.id, { onDelete: "set null" }),

	// Description/image
	description: text("description"),
	imageUrl: text("image_url"),

	// Room assignment
	roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),

	// Google Calendar integration
	googleCalendarEventId: text("google_calendar_event_id"),

	// POS linkage for double-commission guard (Policy P6)
	salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
}, (table) => ({
	branchIdIdx: index("appointments_branch_idx").on(table.branchId),
	serviceIdIdx: index("appointments_service_idx").on(table.serviceId),
	startTimeIdx: index("appointments_start_time_idx").on(table.startTime),
	statusIdx: index("appointments_status_idx").on(table.status),
	typeIdx: index("appointments_type_idx").on(table.type),
	recurringParentIdIdx: index("appointments_recurring_idx").on(table.recurringParentId),
	stripePaymentIntentIdIdx: index("appointments_stripe_payment_idx").on(table.stripePaymentIntentId),
	startTimeStatusIdx: index("appointments_start_time_status_idx").on(table.startTime, table.status),
	bookingNumberIdx: index("appointments_booking_number_idx").on(table.bookingNumber),
	userIdIdx: index("appointments_user_idx").on(table.userId),
	trainerIdIdx: index("appointments_trainer_idx").on(table.trainerId),
	packageInstanceIdIdx: index("appointments_package_instance_idx").on(table.packageInstanceId),
	classSlotIdIdx: index("appointments_class_slot_idx").on(table.classSlotId),
	userStatusIdx: index("appointments_user_status_idx").on(table.userId, table.status),
	roomIdIdx: index("appointments_room_idx").on(table.roomId),
	salesOrderIdIdx: index("appointments_sales_order_idx").on(table.salesOrderId),
	isRecurringIdx: index("appointments_is_recurring_idx").on(table.isRecurring),
	// Prevents concurrent materialization from creating duplicate occurrence rows for the same parent + date.
	// Note: the migration uses a partial index (WHERE recurring_parent_id IS NOT NULL) for efficiency;
	// Postgres treats NULLs as distinct in unique indexes so non-recurring rows are unaffected.
	appointmentsRecurringOccurrenceUniqueIdx: uniqueIndex("appointments_recurring_occurrence_unique_idx").on(
		table.recurringParentId,
		table.startTime
	),
}));

