/**
 * Tenant GoHighLevel Contact Links Schema
 *
 * Maps GoHighLevel contacts to internal customer profile records.
 * Each (customer, branch) pair maps to exactly one GHL Contact in the
 * branch's GHL location (cardinality enforced by UNIQUE).
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

export const ghlContactLinks = pgTable(
	"ghl_contact_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ghlContactId: text("ghl_contact_id").notNull(),
		userId: text("user_id").notNull(),
		customerProfileId: uuid("customer_profile_id").references(
			() => customerProfiles.id,
			{ onDelete: "set null" },
		),
		// NEW: which Avantej branch this contact belongs to.
		// Cross-DB ref to hierarchy_nodes.id where type='branch' (no FK).
		branchNodeId: uuid("branch_node_id").notNull(),
		// NEW: denormalized ghl_location_id for outbound calls without a
		// control-panel join.
		ghlLocationId: text("ghl_location_id").notNull(),
		// NEW: last GHL sync error (failure mode B observability).
		lastError: text("last_error"),
		syncStatus: text("sync_status").default("active").notNull(),
		lastSyncedAt: timestamp("last_synced_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		ghlContactIdUniqueIdx: uniqueIndex(
			"ghl_contact_links_ghl_contact_id_unique",
		).on(table.ghlContactId),
		// NEW: unique on (customer, branch) — same customer at multiple
		// branches has multiple Contact rows.
		customerBranchUniqueIdx: uniqueIndex(
			"ghl_contact_links_customer_branch_unique",
		).on(table.customerProfileId, table.branchNodeId),
		userIdIdx: index("ghl_contact_links_user_idx").on(table.userId),
		customerProfileIdIdx: index("ghl_contact_links_customer_profile_idx").on(
			table.customerProfileId,
		),
		branchNodeIdIdx: index("ghl_contact_links_branch_idx").on(
			table.branchNodeId,
		),
		ghlLocationIdIdx: index("ghl_contact_links_ghl_location_idx").on(
			table.ghlLocationId,
		),
		syncStatusIdx: index("ghl_contact_links_sync_status_idx").on(
			table.syncStatus,
			table.lastSyncedAt,
		),
		lastSyncedAtIdx: index("ghl_contact_links_last_synced_idx").on(
			table.lastSyncedAt,
		),
	}),
);
