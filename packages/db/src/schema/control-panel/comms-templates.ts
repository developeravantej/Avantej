/**
 * Control Panel — Comms Templates schema (Plan F.2.5, Agent C).
 *
 * Reusable templates for the platform-admin direct-message and
 * announcement composers. The bulk composer (Agent B) pulls from this
 * table by `kind`. Soft-delete via archived_at.
 *
 * created_by_user_id is plain text (Better-Auth user id) — no FK so
 * templates survive admin user deletion.
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const commsTemplates = pgTable(
	"comms_templates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		subject: text("subject").notNull(),
		bodyMarkdown: text("body_markdown").notNull(),
		kind: text("kind").notNull(), // 'direct_message' | 'announcement'
		priority: text("priority"), // nullable; only meaningful for announcements
		targetAudience: text("target_audience"), // nullable; only meaningful for announcements
		createdByUserId: text("created_by_user_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(table) => ({
		kindIdx: index("comms_templates_kind_idx").on(table.kind),
		nameIdx: index("comms_templates_name_idx").on(table.name),
	}),
);
