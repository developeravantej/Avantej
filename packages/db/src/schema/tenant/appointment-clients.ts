/**
 * Tenant Appointment Clients Schema
 *
 * Links clients to appointments, tracking their attendance and package usage.
 *
 * Business Rules:
 * - One client can only be assigned once per appointment (enforced by unique index)
 * - pricePaid may differ from appointment.pricePerClient if discounts applied
 * - attended is null until appointment is completed
 * - packageInstanceId links to the package instance whose credit was consumed for
 *   this booking. Per-client (not per-appointment) so group classes can track each
 *   client drawing from their own pack.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { appointments } from "./appointments";
import { packageInstances } from "./package-instances";
import { walkInCustomers } from "./walk-in-customers";

export const appointmentClients = pgTable(
	"appointment_clients",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		appointmentId: uuid("appointment_id")
			.notNull()
			.references(() => appointments.id, { onDelete: "cascade" }),
		clientId: text("client_id").notNull(), // References members.userId
		// Per-client package credit tracking (group class where 3 clients each use their own pack)
		packageInstanceId: uuid("package_instance_id").references(
			() => packageInstances.id,
			{ onDelete: "set null" },
		),
		pricePaid: integer("price_paid").notNull(), // Price this client paid (in cents)
		attended: boolean("attended"), // null = not yet occurred, true/false after completion
		notes: text("notes"),
		clientType: text("client_type").notNull().default("member"),
		walkInCustomerId: uuid("walk_in_customer_id").references(
			() => walkInCustomers.id,
			{ onDelete: "restrict" },
		),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => ({
		appointmentClientUniqueIdx: uniqueIndex(
			"appointment_clients_unique_idx",
		).on(table.appointmentId, table.clientId),
		appointmentIdIdx: index("appointment_clients_appointment_idx").on(
			table.appointmentId,
		),
		clientIdIdx: index("appointment_clients_client_idx").on(table.clientId),
		packageInstanceIdIdx: index("appointment_clients_package_instance_idx").on(
			table.packageInstanceId,
		),
		walkInCustomerIdIdx: index("appt_clients_walk_in_idx").on(
			table.walkInCustomerId,
		),
	}),
);
