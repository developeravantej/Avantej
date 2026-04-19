/**
 * Tenant Commission Splits Schema
 *
 * Stores the calculated commission splits for staff members per appointment or sales order.
 * Lifecycle: pending → approved → paid (or void from any state).
 *
 * Business Rules:
 * - Each row targets exactly one source: either appointmentId OR salesOrderId (enforced by CHECK constraint).
 * - One commission split per (appointment_id, staff_id) or (sales_order_id, staff_id) — enforced by two
 *   partial unique indexes (see migration 0024_commission_splits_status).
 * - splitPercentage must be between 0-100.
 * - calculatedAmount is pre-tax: sessionTotal × splitPercentage / 100 (integer cents).
 * - status follows: pending → approved → paid | void (from any state).
 *
 * NOTE: payoutId intentionally has NO Drizzle FK reference to payouts to avoid a circular
 * import (payouts.ts already references commission-splits.ts). The FK is enforced by the
 * raw SQL migration (ON DELETE SET NULL). Drizzle treats it as a plain uuid field.
 */

import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { appointments } from "./appointments";
import { salesOrders } from "./sales-orders";

export const commissionSplits = pgTable(
	"commission_splits",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Target — exactly one must be set (enforced by CHECK constraint in migration)
		appointmentId: uuid("appointment_id").references(() => appointments.id, {
			onDelete: "cascade",
		}),
		salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, {
			onDelete: "restrict",
		}),

		// Staff
		staffId: text("staff_id").notNull(), // References members.userId (cross-DB — no FK)

		// Split details
		splitPercentage: integer("split_percentage").notNull(), // 0–100 integer (e.g. 70 = 70%)
		calculatedAmount: integer("calculated_amount").notNull(), // Pre-tax amount in integer cents
		notes: text("notes"),

		// Lifecycle status: pending | approved | paid | void
		status: text("status").notNull().default("pending"),

		// Approval
		approvedBy: text("approved_by"), // References members.userId
		approvedAt: timestamp("approved_at", { withTimezone: true }),

		// Payment
		paidBy: text("paid_by"), // References members.userId
		paidAt: timestamp("paid_at", { withTimezone: true }),

		// Payout linkage (no Drizzle FK — avoids circular import with payouts.ts)
		payoutId: uuid("payout_id"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		// Partial unique indexes handled in migration SQL (Drizzle can't express WHERE clause)
		// commission_splits_appt_staff_unique  ON (appointment_id, staff_id) WHERE appointment_id IS NOT NULL
		// commission_splits_so_staff_unique    ON (sales_order_id, staff_id) WHERE sales_order_id IS NOT NULL

		// Regular indexes for query performance
		appointmentIdIdx: index("commission_splits_appointment_idx").on(
			table.appointmentId,
		),
		staffIdIdx: index("commission_splits_staff_idx").on(table.staffId),
		statusIdx: index("commission_splits_status_idx").on(table.status),
		payoutIdx: index("commission_splits_payout_idx").on(table.payoutId),
		salesOrderIdx: index("commission_splits_sales_order_idx").on(
			table.salesOrderId,
		),
	}),
);
