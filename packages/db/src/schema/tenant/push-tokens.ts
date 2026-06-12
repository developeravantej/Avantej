/**
 * Push Tokens Schema (tenant)
 *
 * Expo/native push-notification device tokens, one row per registered
 * device. userId is the cross-DB Better-Auth user id (plain text — never an
 * FK across the control-panel/tenant boundary).
 *
 * Modeled from the live table (migration 0089 backfills it idempotently —
 * the table predates its schema model; see schema-drift gate).
 */

import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const pushTokens = pgTable(
	"push_tokens",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),
		token: text("token").notNull(),
		platform: text("platform").notNull(), // "ios" | "android"
		deviceId: text("device_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		userIdx: index("push_tokens_user_idx").on(table.userId),
		tokenUnique: uniqueIndex("push_tokens_token_unique").on(table.token),
	}),
);
