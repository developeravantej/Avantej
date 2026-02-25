/**
 * Tenant GoHighLevel Contact Links Schema
 *
 * Maps GoHighLevel contacts to internal customer profile records.
 */

import {
	index,
	pgTable,
	text,
	timestamp,
	uuid,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { customerProfiles } from "./customer-profiles";

export const ghlContactLinks = pgTable("ghl_contact_links", {
	id: uuid("id").primaryKey().defaultRandom(),
	ghlContactId: text("ghl_contact_id").notNull(),
	userId: text("user_id").notNull(),
	customerProfileId: uuid("customer_profile_id").references(
		() => customerProfiles.id,
		{ onDelete: "set null" }
	),
	syncStatus: text("sync_status").default("active").notNull(), // active | deleted | error
	lastSyncedAt: timestamp("last_synced_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	ghlContactIdUniqueIdx: uniqueIndex("ghl_contact_links_ghl_contact_id_unique").on(
		table.ghlContactId
	),
	userIdIdx: index("ghl_contact_links_user_idx").on(table.userId),
	customerProfileIdIdx: index("ghl_contact_links_customer_profile_idx").on(
		table.customerProfileId
	),
	syncStatusIdx: index("ghl_contact_links_sync_status_idx").on(table.syncStatus),
	lastSyncedAtIdx: index("ghl_contact_links_last_synced_idx").on(table.lastSyncedAt),
}));

