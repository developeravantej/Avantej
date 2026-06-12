/**
 * Control Panel Platform Admins Schema
 *
 * Designates which users have Avantej platform administrator privileges.
 * Platform admins can impersonate users, view all organizations, and access admin panel.
 *
 * Roles:
 * - super_admin: Full platform access, can grant/revoke admin privileges
 * - support: Can impersonate users, view tenants, but cannot modify billing
 * - billing: Can view payment data, manage subscriptions, but cannot impersonate
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const platformAdmins = pgTable(
	"platform_admins",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").notNull(), // super_admin, support, billing
		grantedBy: text("granted_by").references(() => users.id, {
			onDelete: "set null",
		}),
		grantedAt: timestamp("granted_at").defaultNow().notNull(),
	},
	(table) => ({
		// Indexes for performance
		// Note: userId already has unique constraint/index via .unique()
		roleIdx: index("platform_admins_role_idx").on(table.role),
	}),
);
