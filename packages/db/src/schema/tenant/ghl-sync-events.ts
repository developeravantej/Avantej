/**
 * Tenant GoHighLevel Sync Events Schema
 *
 * Stores webhook payloads and processing outcomes for observability.
 */

import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const ghlSyncEvents = pgTable("ghl_sync_events", {
	id: uuid("id").primaryKey().defaultRandom(),
	eventKey: text("event_key").notNull(),
	eventType: text("event_type").notNull(), // create | update | delete | custom
	ghlContactId: text("ghl_contact_id"),
	email: text("email"),
	status: text("status").notNull(), // processed | skipped | failed | deduped
	errorMessage: text("error_message"),
	rawPayload: jsonb("raw_payload").$type<Record<string, unknown> | null>(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	eventKeyUniqueIdx: uniqueIndex("ghl_sync_events_event_key_unique").on(
		table.eventKey
	),
	eventTypeIdx: index("ghl_sync_events_event_type_idx").on(table.eventType),
	ghlContactIdIdx: index("ghl_sync_events_contact_idx").on(table.ghlContactId),
	statusIdx: index("ghl_sync_events_status_idx").on(table.status),
	createdAtIdx: index("ghl_sync_events_created_idx").on(table.createdAt),
}));

