/**
 * Tenant Permissions Schema
 * 
 * Defines permissions as resource:action pairs (e.g., "hierarchy_management:create").
 * Permissions are seeded automatically and can be assigned to roles.
 */

import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";

export const permissions = pgTable("permissions", {
	id: uuid("id").primaryKey().defaultRandom(),
	resource: text("resource").notNull(), // "hierarchy_management", "user_management", etc.
	action: text("action").notNull(), // "create", "read", "update", "delete"
	description: text("description"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	resourceActionIdx: unique("permissions_resource_action_unique").on(table.resource, table.action),
	resourceIdx: index("permissions_resource_idx").on(table.resource),
}));

