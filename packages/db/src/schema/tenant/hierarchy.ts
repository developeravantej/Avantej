/**
 * Tenant Hierarchy Nodes Schema
 *
 * 4-level org hierarchy (post Phase H1): organization → country → state → branch.
 *
 * Per-tenant DB isolation (no organizationId column; the tenant DB itself
 * is the org boundary).
 *
 * Business Rules:
 * - Fixed 4-level depth: organization (0) → country (1) → state (2) → branch (3)
 * - Cannot delete node with active children (app layer)
 * - Cannot delete node with assigned members (app layer)
 * - Branch names globally unique across org (DB partial unique index)
 * - Other node names unique within parent (DB partial unique post Phase H-hygiene)
 * - ≥ 1 active branch under org (app layer)
 * - Soft archive via archived_at (Phase G0); hard delete still allowed
 * - Phase H2: `type` is now a Postgres enum (hierarchy_node_type); `slug`
 *   column added; branch-specific columns (address, pic_user_id) split
 *   into the `branch_details` table.
 */

import { pgEnum, pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const hierarchyNodeType = pgEnum("hierarchy_node_type", [
	"organization",
	"country",
	"state",
	"branch",
]);

export const hierarchyNodes = pgTable(
	"hierarchy_nodes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		type: hierarchyNodeType("type").notNull(),
		parentId: uuid("parent_id").references((): any => hierarchyNodes.id, {
			onDelete: "restrict",
		}),
		depth: integer("depth").notNull(), // 0=org, 1=country, 2=state, 3=branch
		// Denormalized FK to country ancestor (Phase G0).
		// NULL for organization + country rows. Populated for state + branch.
		// Maintained by createHierarchyNode + moveNode service helpers.
		countryNodeId: uuid("country_node_id").references((): any => hierarchyNodes.id, {
			onDelete: "restrict",
		}),
		// Branch-specific columns moved to branch_details table in Phase H2.
		// Soft archive (Phase G0). NULL = active.
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		parentIdIdx: index("hierarchy_parent_idx").on(table.parentId),
		typeIdx: index("hierarchy_type_idx").on(table.type),
		depthIdx: index("hierarchy_depth_idx").on(table.depth),
		countryIdx: index("hierarchy_country_idx").on(table.countryNodeId),
		archivedAtIdx: index("hierarchy_archived_at_idx").on(table.archivedAt),
		// Partial unique indexes are added via migration script (Drizzle's
		// pgTable doesn't support partial uniques natively):
		// - hierarchy_nodes_branch_name_unique on (name) WHERE type='branch'
		// - hierarchy_country_name_unique on (name) WHERE type='country' AND archived_at IS NULL
		// - hierarchy_state_sibling_name_unique on (parent_id, name) WHERE type='state' AND archived_at IS NULL
		// - hierarchy_sibling_slug_unique on (parent_id, slug) WHERE archived_at IS NULL
	}),
);
