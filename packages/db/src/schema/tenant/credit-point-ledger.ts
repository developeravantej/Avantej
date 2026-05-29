import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * credit_point_ledger — append-only audit trail for customer credit points
 * (F-CRM-02). `delta` is negative for redemptions, positive for earn/adjust;
 * `balanceAfter` snapshots the running balance. The authoritative balance lives
 * on customer_profiles.creditPoints — this table is the trail of how it changed.
 * `customerUserId` is the cross-DB user id (text, no FK), matching the
 * customer_profiles.userId convention.
 */
export const creditPointLedger = pgTable(
	"credit_point_ledger",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		customerUserId: text("customer_user_id").notNull(),
		delta: integer("delta").notNull(),
		balanceAfter: integer("balance_after").notNull(),
		reason: text("reason").notNull(),
		sourceType: text("source_type"),
		sourceId: uuid("source_id"),
		actorUserId: text("actor_user_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		customerIdx: index("credit_point_ledger_customer_idx").on(table.customerUserId),
	}),
);
