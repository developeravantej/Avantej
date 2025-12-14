/**
 * Tenant Hierarchy Nodes Schema
 * 
 * Represents the 5-level organizational hierarchy within a tenant organization:
 * organization (0) → country (1) → region (2) → area (3) → branch (4)
 * 
 * Each tenant database has its own isolated hierarchy_nodes table.
 * No organizationId field needed since each tenant has its own database.
 * 
 * Business Rules:
 * - Fixed 5-level depth: organization (0) → country (1) → region (2) → area (3) → branch (4)
 * - Cannot add nodes deeper than branch level (depth > 4) (enforced in app layer)
 * - Cannot delete node with active child nodes (enforced in app layer)
 * - Cannot delete node with assigned members (enforced in app layer)
 * - Node names unique within parent scope (enforced in app layer)
 * - At least one active branch must exist under organization (enforced in app layer)
 * - Deletion is hard delete (permanently removes the record)
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const hierarchyNodes = pgTable("hierarchy_nodes", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	type: text("type").notNull(), // organization | country | region | area | branch
	parentId: uuid("parent_id").references((): any => hierarchyNodes.id, { onDelete: "restrict" }),
	depth: integer("depth").notNull(), // 0 = org, 1 = country, 2 = region, 3 = area, 4 = branch
	// Branch-specific fields (nullable, only used for branch type nodes)
	address: text("address"), // Physical address of the branch
	picUserId: text("pic_user_id"), // Person In Charge - references control panel users.id (text, no FK constraint due to cross-database)
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	// Indexes for performance
	parentIdIdx: index("hierarchy_parent_idx").on(table.parentId),
	typeIdx: index("hierarchy_type_idx").on(table.type),
	depthIdx: index("hierarchy_depth_idx").on(table.depth),
	picUserIdIdx: index("hierarchy_pic_user_idx").on(table.picUserId),
}));

