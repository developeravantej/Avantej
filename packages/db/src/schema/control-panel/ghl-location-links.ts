/**
 * Control Panel GoHighLevel Location Links Schema
 *
 * Maps GoHighLevel location IDs to Avantej organizations for webhook routing.
 */

import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const ghlLocationLinks = pgTable("ghl_location_links", {
	id: uuid("id").primaryKey().defaultRandom(),
	locationId: text("location_id").notNull(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	webhookSecret: text("webhook_secret"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	locationIdUniqueIdx: uniqueIndex("ghl_location_links_location_id_unique").on(
		table.locationId
	),
	organizationIdIdx: index("ghl_location_links_org_idx").on(table.organizationId),
	isActiveIdx: index("ghl_location_links_active_idx").on(table.isActive),
}));

