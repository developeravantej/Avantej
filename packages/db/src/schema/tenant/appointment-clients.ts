/**
 * Tenant Appointment Clients Schema
 * 
 * Links clients to appointments, tracking their attendance and package usage.
 * 
 * Business Rules:
 * - One client can only be assigned once per appointment (enforced by unique index)
 * - pricePaid may differ from appointment.pricePerClient if discounts applied
 * - attended is null until appointment is completed
 * - packageAssignmentId links to the package used for this booking
 */

import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";
import { packageAssignments } from "./package-assignments";

export const appointmentClients = pgTable("appointment_clients", {
	id: uuid("id").primaryKey().defaultRandom(),
	appointmentId: uuid("appointment_id")
		.notNull()
		.references(() => appointments.id, { onDelete: "cascade" }),
	clientId: text("client_id").notNull(), // References members.userId
	packageAssignmentId: uuid("package_assignment_id")
		.references(() => packageAssignments.id, { onDelete: "set null" }), // Which package was used
	pricePaid: integer("price_paid").notNull(), // Price this client paid (in cents)
	attended: boolean("attended"), // null = not yet occurred, true/false after completion
	notes: text("notes"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	appointmentClientUniqueIdx: uniqueIndex("appointment_clients_unique_idx").on(
		table.appointmentId,
		table.clientId
	),
	appointmentIdIdx: index("appointment_clients_appointment_idx").on(table.appointmentId),
	clientIdIdx: index("appointment_clients_client_idx").on(table.clientId),
	packageAssignmentIdIdx: index("appointment_clients_package_idx").on(table.packageAssignmentId),
}));

