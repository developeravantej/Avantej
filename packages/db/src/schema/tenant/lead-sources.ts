/**
 * Tenant Schema — lead_sources (Phase 3 Agent 3.2)
 *
 * Lookup table of marketing/acquisition channels (e.g. "Walk-in",
 * "Google Ads", "Referral"). Customer profiles reference one entry to
 * record where each lead originated. Deactivated entries (`isActive=false`)
 * stay in the table for historical attribution but are hidden from new
 * create-customer pickers.
 */

import {
	boolean,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const leadSources = pgTable(
	"lead_sources",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		// 'organic' | 'paid' | 'referral' | 'direct' (validated at the service layer)
		category: text("category"),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => ({
		nameUnique: uniqueIndex("lead_sources_name_unique").on(t.name),
	}),
);
