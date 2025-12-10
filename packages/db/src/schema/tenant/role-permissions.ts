/**
 * Tenant Role-Permissions Schema
 * 
 * Many-to-many relationship between roles and permissions.
 * Defines which permissions each role has.
 */

import { pgTable, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { permissions } from "./permissions";

export const rolePermissions = pgTable("role_permissions", {
	id: uuid("id").primaryKey().defaultRandom(),
	roleId: uuid("role_id")
		.notNull()
		.references(() => roles.id, { onDelete: "cascade" }),
	permissionId: uuid("permission_id")
		.notNull()
		.references(() => permissions.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	rolePermissionIdx: unique("role_permissions_role_permission_unique").on(table.roleId, table.permissionId),
	roleIdIdx: index("role_permissions_role_idx").on(table.roleId),
	permissionIdIdx: index("role_permissions_permission_idx").on(table.permissionId),
}));


