/**
 * Control Panel GoHighLevel Branch Links Schema
 *
 * Maps Avantej branches to GoHighLevel sub-account/location IDs and stores
 * the per-branch Private Integration API key (encrypted) used for outbound
 * sync calls and the webhook secret used for inbound HMAC verification.
 *
 * Cardinality: one row per (organization, branch). One GHL location can
 * only be linked to one Avantej branch (enforced by UNIQUE on
 * ghl_location_id).
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

export const ghlBranchLinks = pgTable(
	"ghl_branch_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		tenantBranchId: uuid("tenant_branch_id").notNull(),
		ghlLocationId: text("ghl_location_id").notNull(),
		ghlApiKey: text("ghl_api_key").notNull(),
		webhookSecret: text("webhook_secret"),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		branchUniqueIdx: uniqueIndex("ghl_branch_links_org_branch_unique").on(
			table.organizationId,
			table.tenantBranchId,
		),
		ghlLocationUniqueIdx: uniqueIndex(
			"ghl_branch_links_ghl_location_unique",
		).on(table.ghlLocationId),
		organizationIdIdx: index("ghl_branch_links_org_idx").on(
			table.organizationId,
		),
		tenantBranchIdIdx: index("ghl_branch_links_branch_idx").on(
			table.tenantBranchId,
		),
		isActiveIdx: index("ghl_branch_links_active_idx").on(table.isActive),
	}),
);
