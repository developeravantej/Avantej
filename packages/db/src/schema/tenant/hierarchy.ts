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
 * - Other node names unique within parent (app layer)
 * - ≥ 1 active branch under org (app layer)
 * - Soft archive via archived_at (Phase G0); hard delete still allowed
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const hierarchyNodes = pgTable(
	"hierarchy_nodes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		type: text("type").notNull(), // organization | country | state | branch
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
		// Branch-specific (nullable, only used when type = 'branch')
		address: text("address"),
		picUserId: text("pic_user_id"), // cross-DB ref to control_panel.users.id
		// Soft archive (Phase G0). NULL = active.
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		parentIdIdx: index("hierarchy_parent_idx").on(table.parentId),
		typeIdx: index("hierarchy_type_idx").on(table.type),
		depthIdx: index("hierarchy_depth_idx").on(table.depth),
		picUserIdIdx: index("hierarchy_pic_user_idx").on(table.picUserId),
		countryIdx: index("hierarchy_country_idx").on(table.countryNodeId),
		archivedAtIdx: index("hierarchy_archived_at_idx").on(table.archivedAt),
		// Partial unique on branch name added via migration script:
		// CREATE UNIQUE INDEX "hierarchy_nodes_branch_name_unique"
		//   ON "hierarchy_nodes"("name") WHERE "type" = 'branch';
	}),
);
