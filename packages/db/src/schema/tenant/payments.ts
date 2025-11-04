/**
 * Tenant Payments Schema
 * 
 * Tracks customer payments for appointments, including Stripe PaymentIntent details,
 * platform fees, and franchiser amounts.
 * 
 * Business Rules:
 * - One payment record per Stripe PaymentIntent (enforced by unique constraint)
 * - Platform fee is calculated as percentage of totalAmount
 * - franchiserAmount = totalAmount - platformFeeAmount
 * - Payment status must match Stripe PaymentIntent status
 * - Payment can be linked to an appointment or standalone (package purchase)
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";

export const payments = pgTable("payments", {
	id: uuid("id").primaryKey().defaultRandom(),
	
	// Stripe payment tracking
	stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
	stripeChargeId: text("stripe_charge_id"),
	
	// Customer information
	customerId: text("customer_id").notNull(), // References members.userId (the client who paid)
	stripeCustomerId: text("stripe_customer_id"), // Stripe Customer ID for this client
	
	// Amount breakdown
	amount: integer("amount").notNull(), // Amount in cents (pre-tax)
	taxAmount: integer("tax_amount").default(0).notNull(), // Tax amount in cents
	totalAmount: integer("total_amount").notNull(), // Total amount in cents (amount + tax)
	currency: text("currency").default("usd").notNull(), // ISO currency code
	
	// Platform fee calculation
	platformFeeAmount: integer("platform_fee_amount").default(0).notNull(), // Platform fee in cents
	platformFeePercentage: integer("platform_fee_percentage").default(0).notNull(), // Platform fee percentage (0-100)
	
	// Franchiser amount (what franchiser receives after platform fee)
	franchiserAmount: integer("franchiser_amount").notNull(), // Amount franchiser receives (totalAmount - platformFeeAmount)
	
	status: text("status").notNull(), // "pending" | "succeeded" | "failed" | "canceled" | "refunded"
	
	// Optional appointment link
	appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
	
	description: text("description"), // Payment description
	metadata: text("metadata"), // JSON metadata (optional)
	
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	stripePaymentIntentIdIdx: index("payments_stripe_pi_idx").on(table.stripePaymentIntentId),
	stripeChargeIdIdx: index("payments_stripe_charge_idx").on(table.stripeChargeId),
	customerIdIdx: index("payments_customer_idx").on(table.customerId),
	appointmentIdIdx: index("payments_appointment_idx").on(table.appointmentId),
	statusIdx: index("payments_status_idx").on(table.status),
	customerStatusIdx: index("payments_customer_status_idx").on(table.customerId, table.status),
}));

