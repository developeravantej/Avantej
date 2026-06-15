/**
 * Tenant Account Groups Schema
 *
 * Ties multiple `customer_profiles` together under one primary login owner.
 * Built for the family/friend shared-email case where two GHL contacts arrive
 * with the same email and only one can hold the `user.email` UNIQUE slot.
 *
 * The primary owns the login (control-panel `user` row). Dependents are
 * `customer_profiles` with `user_id = NULL` + `account_group_id` set.
 *
 * `primary_user_id` references control-panel `user.id` (text). No FK
 * constraint due to cross-database; application layer enforces integrity.
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const accountGroups = pgTable(
	"account_groups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name"),
		// References control-panel user.id. No FK (cross-database).
		primaryUserId: text("primary_user_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		primaryUserIdx: index("account_groups_primary_user_idx").on(
			table.primaryUserId,
		),
	}),
);
