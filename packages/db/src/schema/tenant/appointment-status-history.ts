/**
 * Appointment Status History
 *
 * Append-only audit log of every status transition on an appointments row.
 * Written in the same transaction as the status mutation via
 * `appendAppointmentStatusHistory()` in services. Coexists with the existing
 * audit_logs entry produced by appointment.service.ts (D.2.2 audit block).
 */

import { pgTable, uuid, index } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";
import { statusHistoryColumns } from "./_status-history-columns";

export const appointmentStatusHistory = pgTable(
	"appointment_status_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		appointmentId: uuid("appointment_id")
			.notNull()
			.references(() => appointments.id, { onDelete: "cascade" }),
		...statusHistoryColumns,
	},
	(t) => ({
		entityIdx: index("appointment_status_hist_entity_idx").on(
			t.appointmentId,
			t.changedAt,
		),
	}),
);
