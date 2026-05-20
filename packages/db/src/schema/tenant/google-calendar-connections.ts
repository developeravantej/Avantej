import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { members } from "./members";

export const gcalSyncDirectionEnum = pgEnum("gcal_sync_direction", [
	"one_way_to_google",
	"one_way_from_google",
	"two_way",
]);

export const gcalConflictPolicyEnum = pgEnum("gcal_conflict_policy", [
	"avantej_wins",
	"google_wins",
	"keep_both",
	"manual_review",
]);

export const googleCalendarConnections = pgTable("google_calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  googleEmail: text("google_email").notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
  syncScope: text("sync_scope").notNull(), // "all" | "own"
  isActive: boolean("is_active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  // Migration 0046 — key rotation tracking.
  // encryptionKeyId: references the KMS key version used to encrypt accessToken/refreshToken.
  // tokenRotatedAt: timestamp of last OAuth token rotation for audit/expiry monitoring.
  encryptionKeyId: text("encryption_key_id"),
  tokenRotatedAt: timestamp("token_rotated_at", { withTimezone: true }),
  // Migration 0057
  syncDirection: gcalSyncDirectionEnum("sync_direction").notNull().default("two_way"),
  conflictPolicy: gcalConflictPolicyEnum("conflict_policy").notNull().default("manual_review"),
  cachedCalendarListJson: text("cached_calendar_list_json"),
  cachedCalendarListAt: timestamp("cached_calendar_list_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  memberIdUniqueIdx: uniqueIndex("gcal_connections_member_idx").on(table.memberId),
  isActiveIdx: index("gcal_connections_active_idx").on(table.isActive),
  syncScopeIdx: index("gcal_connections_scope_idx").on(table.syncScope),
}));
