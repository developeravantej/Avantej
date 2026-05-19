/**
 * Tenant Payouts Schema
 * 
 * Tracks payouts from the franchiser to partners (coaches/trainers).
 * Supports both Stripe Connect automated transfers and manual bank transfers.
 * 
 * Business Rules:
 * - Payout amount is based on commission splits from appointments
 * - Stripe Connect payouts are automated via Stripe Transfer API
 * - Manual payouts require confirmation by admin/staff
 * - Payout status tracks the lifecycle: pending → processing → paid/failed
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";
import { commissionSplits } from "./commission-splits";
import { payoutBatches } from "./payout-batches";

export const payouts = pgTable("payouts", {
	id: uuid("id").primaryKey().defaultRandom(),
	
	// Stripe tracking (for Stripe Connect payouts)
	stripeTransferId: text("stripe_transfer_id"),
	stripePayoutId: text("stripe_payout_id"),
	
	// Recipient information
	recipientId: text("recipient_id").notNull(), // References members.userId (coach receiving payout)
	stripeConnectAccountId: text("stripe_connect_account_id"), // Coach's Stripe Connect account (if they have one)
	
	// Related records
	// Migration 0046 P0 fix: NOT NULL dropped — payouts can now be created for
	// package-instance or sales-order commissions without a linked appointment.
	appointmentId: uuid("appointment_id")
		.references(() => appointments.id, { onDelete: "restrict" }),
	commissionSplitId: uuid("commission_split_id")
		.references(() => commissionSplits.id, { onDelete: "set null" }),

	// Agent 2.5 — payout batch grouping (J5 commission audit)
	batchId: uuid("batch_id")
		.references(() => payoutBatches.id, { onDelete: "set null" }),
	
	// Amount details
	amount: integer("amount").notNull(),
	// Migration 0056
	grossAmountCents: integer("gross_amount_cents"),
	deductionsCents: integer("deductions_cents").notNull().default(0),
	currency: text("currency").default("usd").notNull(),
	
	// Payout method
	payoutMethod: text("payout_method").notNull(), // "stripe_connect" | "manual_bank_transfer"
	
	// Manual payout tracking
	bankAccountLast4: text("bank_account_last_4"), // For manual payouts
	manualPayoutConfirmedAt: timestamp("manual_payout_confirmed_at"),
	manualPayoutConfirmedBy: text("manual_payout_confirmed_by"), // References members.userId (who confirmed)
	
	status: text("status").notNull(), // "pending" | "processing" | "paid" | "failed" | "canceled"
	
	scheduledAt: timestamp("scheduled_at"),
	paidAt: timestamp("paid_at"),
	
	description: text("description"),
	notes: text("notes"),
	
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	recipientIdIdx: index("payouts_recipient_idx").on(table.recipientId),
	appointmentIdIdx: index("payouts_appointment_idx").on(table.appointmentId),
	commissionSplitIdIdx: index("payouts_commission_split_idx").on(table.commissionSplitId),
	stripeTransferIdIdx: index("payouts_stripe_transfer_idx").on(table.stripeTransferId),
	stripePayoutIdIdx: index("payouts_stripe_payout_idx").on(table.stripePayoutId),
	statusIdx: index("payouts_status_idx").on(table.status),
	payoutMethodIdx: index("payouts_payout_method_idx").on(table.payoutMethod),
	recipientStatusIdx: index("payouts_recipient_status_idx").on(table.recipientId, table.status),
	batchIdIdx: index("payouts_batch_id_idx").on(table.batchId),
}));

