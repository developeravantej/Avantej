/**
 * Tenant Branch Details
 *
 * Branch-specific columns split out of `hierarchy_nodes` in Phase H2.
 * One row per branch (type='branch' in hierarchy_nodes), keyed by
 * `node_id` → hierarchy_nodes.id with ON DELETE CASCADE. Created
 * lazily by createHierarchyNode when the new branch has any
 * branch-specific data; absent rows mean no data set.
 *
 * Cross-DB note: `pic_user_id` references control panel `users.id`
 * (text type, no FK constraint due to cross-database).
 */

import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const branchDetails = pgTable(
	"branch_details",
	{
		nodeId: uuid("node_id")
			.primaryKey()
			.references(() => hierarchyNodes.id, { onDelete: "cascade" }),
		address: text("address"),
		picUserId: text("pic_user_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		picUserIdIdx: index("branch_details_pic_user_idx").on(table.picUserId),
	}),
);

// TODO(Phase H2): If inferred relation types require a reciprocal
// `branchDetails` relation on hierarchyNodes, add it in hierarchy.ts.
export const branchDetailsRelations = relations(branchDetails, ({ one }) => ({
	node: one(hierarchyNodes, {
		fields: [branchDetails.nodeId],
		references: [hierarchyNodes.id],
	}),
}));
