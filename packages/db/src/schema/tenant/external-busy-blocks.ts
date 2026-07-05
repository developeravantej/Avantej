// packages/db/src/schema/tenant/external-busy-blocks.ts

/**
 * Tenant External Busy Blocks Schema (UAT §6 — Google Calendar pull-sync)
 *
 * Busy intervals pulled FROM an external calendar (Google) INTO Avantej so the
 * coach's bookable availability reflects events created outside Avantej. Each row
 * is one event in the connected member's Google Calendar within the sync window.
 *
 * `computeAvailableSlots` subtracts these blocks exactly like booked appointments,
 * so a meeting in Google removes the overlapping slot from the booking flow
 * ("Read availability: busy times in Google Calendar block matching slots").
 *
 * The pull is idempotent: rows are upserted by (connection_id, google_event_id),
 * and events that vanish from the window are pruned, so re-running the sweep on a
 * partially-synced tenant is safe.
 */

import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { members } from "./members";
import { googleCalendarConnections } from "./google-calendar-connections";

export const externalBusyBlocks = pgTable(
	"external_busy_blocks",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// The connection (and therefore the Google account) this block came from.
		connectionId: uuid("connection_id")
			.notNull()
			.references(() => googleCalendarConnections.id, { onDelete: "cascade" }),

		// The trainer/member whose availability this block affects. Denormalized
		// from the connection so availability queries filter by trainer directly.
		trainerId: uuid("trainer_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),

		// The Google Calendar event id — the idempotency key within a connection.
		googleEventId: text("google_event_id").notNull(),

		startTime: timestamp("start_time", { withTimezone: true }).notNull(),
		endTime: timestamp("end_time", { withTimezone: true }).notNull(),
		summary: text("summary"),

		// "google" today; kept explicit so other providers can reuse this table.
		source: text("source").notNull().default("google"),

		syncedAt: timestamp("synced_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		// One row per Google event per connection — the upsert conflict target.
		connectionEventUnique: uniqueIndex(
			"external_busy_blocks_connection_event_unique",
		).on(table.connectionId, table.googleEventId),
		trainerWindowIdx: index("external_busy_blocks_trainer_window_idx").on(
			table.trainerId,
			table.startTime,
		),
		connectionIdx: index("external_busy_blocks_connection_idx").on(
			table.connectionId,
		),
	}),
);
