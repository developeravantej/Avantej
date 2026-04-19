/**
 * Tenant Check-Ins Schema
 *
 * Records attendance events — either linked to a booked appointment or as a drop-in.
 * Polymorphic clientType/clientId pattern mirrors sales_orders.customerType/customerId.
 *
 * CHECK constraints (clientType, source, outcome) are enforced in the SQL migration
 * (0022_check_ins); the TypeScript columns stay as plain text for ORM compatibility.
 */

import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { appointmentClients } from "./appointment-clients";
import { hierarchyNodes } from "./hierarchy";

export const checkIns = pgTable(
	"check_ins",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Client (polymorphic — "member" | "walk_in")
		clientType: text("client_type").notNull(),
		// members.userId for "member"; walk_in_customers.id for "walk_in"
		clientId: text("client_id").notNull(),

		// Branch (always set; RBAC scoped by branchId in accessibleNodeIds)
		branchId: uuid("branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "restrict" }),

		// Optional appointment linkage (null for drop-ins)
		appointmentClientId: uuid("appointment_client_id").references(
			() => appointmentClients.id,
			{ onDelete: "set null" },
		),

		// Source — "booking" (linked to appointment) | "drop_in"
		source: text("source").notNull(),

		// Outcome — "attended" | "no_show" | "late_cancel"
		outcome: text("outcome").notNull().default("attended"),

		// Optional credit consumption tracking
		packageInstanceId: uuid("package_instance_id"), // null if no credit consumed
		creditsConsumed: integer("credits_consumed").default(0).notNull(),

		// Metadata
		notes: text("notes"),

		// Staff who performed the check-in (members.userId)
		checkedInBy: text("checked_in_by").notNull(),

		checkedInAt: timestamp("checked_in_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		clientIdx: index("check_ins_client_idx").on(
			table.clientType,
			table.clientId,
			table.checkedInAt,
		),
		branchIdx: index("check_ins_branch_idx").on(
			table.branchId,
			table.checkedInAt,
		),
		apptClientIdx: index("check_ins_appt_client_idx").on(
			table.appointmentClientId,
		),
		checkedInAtIdx: index("check_ins_checked_in_at_idx").on(table.checkedInAt),
	}),
);
