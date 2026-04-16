import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { members } from "./members";

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  memberIdUniqueIdx: uniqueIndex("gcal_connections_member_idx").on(table.memberId),
  isActiveIdx: index("gcal_connections_active_idx").on(table.isActive),
  syncScopeIdx: index("gcal_connections_scope_idx").on(table.syncScope),
}));
