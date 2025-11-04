/**
 * Tenant Packages Schema
 * 
 * Represents prepaid session packages that clients can purchase.
 * Packages can be restricted to specific services via allowedServiceIds (JSONB array).
 * 
 * Business Rules:
 * - Package names must be unique within a branch (enforced in app layer)
 * - Session count must be positive
 * - Price per session must be non-negative
 * - Expiry can be either calculated from expiryDays or fixed via expiryDate
 * - allowedServiceIds: null = all services allowed (type-based), array = only listed services allowed
 * - Cross-usage allows semi-private packages to be used for private sessions (and vice versa)
 */

import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const packages = pgTable("packages", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	appointmentType: text("appointment_type").notNull(), // "private" | "semi-private" | "both"
	crossUsageEnabled: boolean("cross_usage_enabled").default(false).notNull(),
	sessionCount: integer("session_count").notNull(),
	pricePerSession: integer("price_per_session").notNull(), // Price per client per session (in cents)
	maxClientsPerSession: integer("max_clients_per_session").notNull(),
	
	// Expiry configuration (mutually exclusive)
	expiryDays: integer("expiry_days"), // Days from assignment, null = fixed expiry date
	expiryDate: timestamp("expiry_date"), // Fixed expiry date, null = calculated from expiryDays
	
	autoGenerateInvoice: boolean("auto_generate_invoice").default(false).notNull(),
	branchId: uuid("branch_id").references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	
	// Service restrictions (JSONB array)
	allowedServiceIds: jsonb("allowed_service_ids").$type<string[] | null>(),
	// null = all services allowed (type-based)
	// ["service-id-1", "service-id-2"] = only these services allowed
	
	isArchived: boolean("is_archived").default(false).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	branchIdIdx: index("packages_branch_idx").on(table.branchId),
	appointmentTypeIdx: index("packages_appointment_type_idx").on(table.appointmentType),
	isArchivedIdx: index("packages_archived_idx").on(table.isArchived),
}));

