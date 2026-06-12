/**
 * Control Panel Organization Branches Schema
 *
 * Registry of tenant branch nodes in the control panel database.
 * Enables branch lookup without tenant DB access (e.g., during user registration).
 *
 * This is a cache/registry table - tenant DB `hierarchy_nodes` (type="branch") is source of truth.
 * Must be kept in sync when branches are created, updated, or deleted in tenant databases.
 *
 * Key use case: New user registration flow
 * 1. User selects a country (SELECT DISTINCT country FROM organization_branches)
 * 2. User selects a branch (filtered by country)
 * 3. Query this table to resolve organizationId
 * 4. Proceed with registration into the correct organization
 */

import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const organizationBranches = pgTable(
	"organization_branches",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		tenantNodeId: uuid("tenant_node_id").notNull(), // References tenant hierarchy_nodes.id (no FK constraint due to cross-database)
		name: text("name").notNull(), // Branch name (globally unique across all organizations)
		countryTenantNodeId: uuid("country_tenant_node_id"), // References tenant hierarchy_nodes.id where type="country" (no FK due to cross-database)
		country: text("country"), // Denormalized country name from tenant hierarchy
		address: text("address"), // Physical address of the branch
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		// Branch names are globally unique across all organizations
		nameUniqueIdx: uniqueIndex("org_branches_name_unique_idx").on(table.name),
		// Indexes for performance
		organizationIdIdx: index("org_branches_org_idx").on(table.organizationId),
		tenantNodeIdIdx: index("org_branches_tenant_node_idx").on(
			table.tenantNodeId,
		),
		countryTenantNodeIdIdx: index("org_branches_country_node_idx").on(
			table.countryTenantNodeId,
		),
		countryIdx: index("org_branches_country_idx").on(table.country),
	}),
);
