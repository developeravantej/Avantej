/**
 * Payout Batches (Agent 2.5 — J5 commission audit)
 *
 * Groups individual payouts into a payroll-period batch so disputes mid-cycle
 * can be reproduced from a frozen group. Each batch covers a (branchId, period)
 * window. Payouts wire to a batch via payouts.batchId (FK added in 0034).
 */

import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	index,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const payoutBatches = pgTable(
	"payout_batches",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "set null",
		}),
		periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
		periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
		// pending | processing | completed | cancelled
		status: text("status").notNull().default("pending"),
		totalCents: integer("total_cents").notNull().default(0),
		createdBy: text("created_by").notNull(), // members.userId (cross-DB; no FK)
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		finalizedAt: timestamp("finalized_at", { withTimezone: true }),
	},
	(t) => ({
		periodIdx: index("payout_batches_period_idx").on(
			t.periodStart,
			t.periodEnd,
		),
		branchIdx: index("payout_batches_branch_idx").on(t.branchId),
		statusIdx: index("payout_batches_status_idx").on(t.status),
	}),
);
