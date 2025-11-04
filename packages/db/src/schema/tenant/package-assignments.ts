/**
 * Tenant Package Assignments Schema
 * 
 * Tracks which clients are assigned which packages, including remaining sessions and expiry.
 * 
 * Business Rules:
 * - One active assignment per client-package combination (enforced in app layer)
 * - sessionsRemaining decrements on each booking
 * - Expired packages cannot be used for new bookings
 * - paymentConfirmed must be true before package can be used
 */

import { pgTable, uuid, text, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { packages } from "./packages";

export const packageAssignments = pgTable("package_assignments", {
	id: uuid("id").primaryKey().defaultRandom(),
	packageId: uuid("package_id")
		.notNull()
		.references(() => packages.id, { onDelete: "restrict" }),
	clientId: text("client_id").notNull(), // References members.userId (no FK due to cross-database)
	assignedBy: text("assigned_by").notNull(), // References members.userId (staff who assigned)
	sessionsRemaining: integer("sessions_remaining").notNull(), // Starts at package.sessionCount, decrements on booking
	sessionsUsed: integer("sessions_used").default(0).notNull(),
	expiryDate: timestamp("expiry_date").notNull(),
	paymentConfirmed: boolean("payment_confirmed").default(false).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	packageIdIdx: index("package_assignments_package_idx").on(table.packageId),
	clientIdIdx: index("package_assignments_client_idx").on(table.clientId),
	expiryDateIdx: index("package_assignments_expiry_idx").on(table.expiryDate),
	clientExpiryIdx: index("package_assignments_client_expiry_idx").on(table.clientId, table.expiryDate),
}));

