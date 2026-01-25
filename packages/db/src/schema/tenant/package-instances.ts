// packages/db/src/schema/tenant/package-instances.ts

/**
 * Tenant Package Instances Schema
 *
 * Unified tracking for both staff-assigned and client-purchased packages.
 * Replaces the previous package_assignments table with enhanced functionality.
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { packages } from "./packages";
import { payments } from "./payments";

export const packageInstances = pgTable("package_instances", {
	id: uuid("id").primaryKey().defaultRandom(),
	packageId: uuid("package_id")
		.notNull()
		.references(() => packages.id, { onDelete: "restrict" }),
	clientId: text("client_id").notNull(),

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
	creditsRemaining: integer("credits_remaining").notNull(),
	creditsUsed: integer("credits_used").default(0).notNull(),

	// Validity
	startsAt: timestamp("starts_at").notNull(),
	expiresAt: timestamp("expires_at").notNull(),

	// Status
	status: text("status").notNull(), // "active" | "expired" | "exhausted" | "cancelled"

	remark: text("remark"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	packageIdIdx: index("package_instances_package_idx").on(table.packageId),
	clientIdIdx: index("package_instances_client_idx").on(table.clientId),
	sourceIdx: index("package_instances_source_idx").on(table.source),
	statusIdx: index("package_instances_status_idx").on(table.status),
	paymentStatusIdx: index("package_instances_payment_status_idx").on(table.paymentStatus),
	expiresAtIdx: index("package_instances_expires_idx").on(table.expiresAt),
	clientStatusIdx: index("package_instances_client_status_idx")
		.on(table.clientId, table.status),
	purchaseNumberIdx: index("package_instances_purchase_number_idx").on(table.purchaseNumber),
}));
