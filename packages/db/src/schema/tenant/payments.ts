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

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
// NOTE: appointments is intentionally not imported here to break the circular
// dependency chain: appointments → package-instances → payments → appointments.
// The FK constraint on appointment_id exists at the DB level (via migration).
// Do not add .references(() => appointments.id) here or the TS7022 error returns.

export const payments = pgTable(
	"payments",
	{
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
		platformFeePercentage: integer("platform_fee_percentage")
			.default(0)
			.notNull(), // Platform fee percentage (0-100)

		// Franchiser amount (what franchiser receives after platform fee)
		franchiserAmount: integer("franchiser_amount").notNull(), // Amount franchiser receives (totalAmount - platformFeeAmount)

		status: text("status").notNull(), // "pending" | "succeeded" | "failed" | "canceled" | "refunded"

		// Optional appointment link (FK to appointments.id exists at DB level via migration)
		appointmentId: uuid("appointment_id"),

		description: text("description"), // Payment description
		metadata: text("metadata"), // JSON metadata (optional)

		// ========== NEW FIELDS ==========

		// Client reference (for mobile app payments)
		userId: text("user_id"), // References Control Panel user.id

		// Payment identifier
		paymentNumber: text("payment_number").unique(),

		// Payment method details
		paymentMethod: text("payment_method"), // "card" | "apple_pay" | "google_pay" | "cash"

		// Invoice linkage (circular import avoidance: no .references() in schema, enforced via manual SQL migration)
		invoiceId: uuid("invoice_id"),

		// LHDN e-invoice tracking
		eInvoiceStatus: text("e_invoice_status"),
		// "pending" | "generated" | "failed" — nullable
		eInvoiceId: text("e_invoice_id"), // LHDN MyInvois API UUID — nullable

		// Refund tracking
		refundedAt: timestamp("refunded_at"),
		refundAmount: integer("refund_amount"),
		failureReason: text("failure_reason"),

		// Agent 3.5 — walk-in → package conversion link (self-ref)
		// Set when a walk-in drop-in payment is converted to a package payment
		// (e.g. customer pays RM50 drop-in, then upgrades to a 10-pack mid-session).
		convertedFromPaymentId: uuid("converted_from_payment_id").references(
			(): any => payments.id,
			{ onDelete: "set null" },
		),

		// Plan B Phase 3c.1 — Stripe Payment Link (POS online checkout) tracking.
		// Populated by payments.createSalesOrderPaymentLink when a POS sale with
		// paymentMethod="online" is recorded; webhook flips status -> "succeeded".
		paymentLinkUrl: text("payment_link_url"),
		stripePaymentLinkId: text("stripe_payment_link_id"),
		stripeConnectAccountIdSnapshot: text("stripe_connect_account_id_snapshot"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		stripePaymentIntentIdIdx: index("payments_stripe_pi_idx").on(
			table.stripePaymentIntentId,
		),
		stripeChargeIdIdx: index("payments_stripe_charge_idx").on(
			table.stripeChargeId,
		),
		customerIdIdx: index("payments_customer_idx").on(table.customerId),
		appointmentIdIdx: index("payments_appointment_idx").on(table.appointmentId),
		statusIdx: index("payments_status_idx").on(table.status),
		customerStatusIdx: index("payments_customer_status_idx").on(
			table.customerId,
			table.status,
		),
		userIdIdx: index("payments_user_idx").on(table.userId),
		paymentNumberIdx: index("payments_payment_number_idx").on(
			table.paymentNumber,
		),
		paymentMethodIdx: index("payments_payment_method_idx").on(
			table.paymentMethod,
		),
		invoiceIdIdx: index("payments_invoice_idx").on(table.invoiceId),
		eInvoiceStatusIdx: index("payments_e_invoice_status_idx").on(
			table.eInvoiceStatus,
		),
		convertedFromIdx: index("payments_converted_from_idx").on(
			table.convertedFromPaymentId,
		),
	}),
);
