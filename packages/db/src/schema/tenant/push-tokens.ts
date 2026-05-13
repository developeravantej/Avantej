// packages/db/src/schema/tenant/push-tokens.ts

/**
 * Tenant Push Tokens Schema
 *
 * Stores Expo push notification tokens per device per user.
 * Unique on token (a device only has one Expo push token at a time).
 * On token refresh / re-registration we upsert by token.
 */

import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	uniqueIndex,
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
		userIdIdx: index("push_tokens_user_idx").on(table.userId),
		tokenUniqueIdx: uniqueIndex("push_tokens_token_unique").on(table.token),
	}),
);
