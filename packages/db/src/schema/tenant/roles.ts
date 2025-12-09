/**
 * Tenant Roles Schema
 * 
 * Defines roles within a tenant organization (admin, trainer, staff, client).
 * System roles cannot be deleted and are seeded automatically.
 * Custom roles can be created by organization admins.
 * 
 * Priority determines permission precedence (higher = more permissions).
 */

import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";

export const roles = pgTable("roles", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(),
	description: text("description"),
	isSystem: boolean("is_system").default(false).notNull(), // System roles can't be deleted
	priority: integer("priority").notNull(), // Higher = more permissions (admin = 100)
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	nameIdx: index("roles_name_idx").on(table.name),
	priorityIdx: index("roles_priority_idx").on(table.priority),
}));

