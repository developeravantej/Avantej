import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";
import { googleCalendarConnections } from "./google-calendar-connections";

export const googleCalendarEventMappings = pgTable("google_calendar_event_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .references(() => appointments.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
  googleEventId: text("google_event_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  appointmentConnectionIdx: uniqueIndex("gcal_event_map_appt_conn_idx")
    .on(table.appointmentId, table.connectionId),
  appointmentIdx: index("gcal_event_map_appt_idx").on(table.appointmentId),
  connectionIdx: index("gcal_event_map_conn_idx").on(table.connectionId),
}));
