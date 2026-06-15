/**
 * Tenant Service Categories Schema
 *
 * Represents service categories for organizing services within a tenant organization.
 * Categories are scoped to a branch level, allowing different branches to have different categorizations.
 *
 * Business Rules:
 * - Category names must be unique within a branch (enforced in app layer)
 * - Categories can be archived instead of deleted to preserve historical data
 * - Display order determines sorting in UI
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const serviceCategories = pgTable(
	"service_categories",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		description: text("description"),
		displayOrder: integer("display_order").default(0).notNull(),
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "restrict",
		}), // Scoped to branch
		isActive: boolean("is_active").default(true).notNull(),
		schedulingType: text("scheduling_type").default("appointment").notNull(), // "appointment" | "class_slot"
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		createdBy: text("created_by"),
		updatedBy: text("updated_by"),
	},
	(table) => ({
		branchIdIdx: index("service_categories_branch_idx").on(table.branchId),
		isActiveIdx: index("service_categories_active_idx").on(table.isActive),
		displayOrderIdx: index("service_categories_order_idx").on(
			table.displayOrder,
		),
	}),
);
