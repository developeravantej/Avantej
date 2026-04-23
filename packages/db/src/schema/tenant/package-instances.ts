// packages/db/src/schema/tenant/package-instances.ts

/**
 * Tenant Package Instances Schema
 *
 * Unified tracking for both staff-assigned and client-purchased packages.
 * Replaces the previous package_assignments table with enhanced functionality.
 */

import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { payments } from "./payments";
import { services } from "./services";
import { walkInCustomers } from "./walk-in-customers";

export const packageInstances = pgTable("package_instances", {
	id: uuid("id").primaryKey().defaultRandom(),
	serviceId: uuid("service_id")
		.notNull()
		.references(() => services.id, { onDelete: "restrict" }),
	clientId: text("client_id"),
	walkInCustomerId: uuid("walk_in_customer_id").references(() => walkInCustomers.id, { onDelete: "restrict" }),

	// Source tracking
	source: text("source").notNull(), // "assigned" | "purchased"
	assignedBy: text("assigned_by"),

	// Purchase details
	purchaseNumber: text("purchase_number").unique(),
	paymentId: uuid("payment_id")
		.references(() => payments.id, { onDelete: "set null" }),

	// Pricing
	totalPrice: integer("total_price"),
	taxAmount: integer("tax_amount").default(0),

	// Payment tracking
	paymentStatus: text("payment_status").notNull(), // "pending" | "paid" | "failed" | "refunded"
	paymentMethod: text("payment_method"),

	// Agreement
	eSignature: text("e_signature"),
	termsAgreedAt: timestamp("terms_agreed_at"),

	// Session tracking
	creditsTotal: integer("credits_total").notNull(),
	creditsRemaining: integer("credits_remaining")
		.generatedAlwaysAs(sql`COALESCE(credits_unlocked, credits_total) - credits_used`)
		.notNull(),
	creditsUsed: integer("credits_used").default(0).notNull(),

	// Validity
	startsAt: timestamp("starts_at").notNull(),
	expiresAt: timestamp("expires_at").notNull(),

	// Status
	status: text("status").notNull(), // "active" | "expired" | "exhausted" | "cancelled"

	remark: text("remark"),

	// Installment tracking
	paymentPlanType: text("payment_plan_type"), // 'full' | 'half' | 'quarterly' | null (null = legacy)
	installmentsTotal: integer("installments_total").default(1).notNull(),
	installmentsPaid: integer("installments_paid").default(0).notNull(),
	creditsUnlocked: integer("credits_unlocked"), // null = all credits available (legacy); integer = installment-controlled
	nextDueDate: timestamp("next_due_date", { withTimezone: true }),
	gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
	isLocked: boolean("is_locked").default(false).notNull(),
	lockedAt: timestamp("locked_at", { withTimezone: true }),
	lockedReason: text("locked_reason"),

	// When true, payment confirmations use max(current, formula) rather than overwriting
	creditsAdminOverride: boolean("credits_admin_override").default(false).notNull(),

	// When true, credit-consuming operations (appointment booking, check-in)
	// ignore the isLocked flag. Admin override for VIP / trusted customers.
	allowCreditOverdraft: boolean("allow_credit_overdraft").default(false).notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	clientIdIdx: index("package_instances_client_idx").on(table.clientId),
	sourceIdx: index("package_instances_source_idx").on(table.source),
	statusIdx: index("package_instances_status_idx").on(table.status),
	paymentStatusIdx: index("package_instances_payment_status_idx").on(table.paymentStatus),
	expiresAtIdx: index("package_instances_expires_idx").on(table.expiresAt),
	clientStatusIdx: index("package_instances_client_status_idx")
		.on(table.clientId, table.status),
	purchaseNumberIdx: index("package_instances_purchase_number_idx").on(table.purchaseNumber),
	serviceIdIdx: index("package_instances_service_idx").on(table.serviceId),
	isLockedIdx: index("package_instances_is_locked_idx").on(table.isLocked),
	nextDueDateIdx: index("package_instances_next_due_date_idx").on(table.nextDueDate),
	walkInCustomerIdIdx: index("pkg_instances_walk_in_idx").on(table.walkInCustomerId),
}));
