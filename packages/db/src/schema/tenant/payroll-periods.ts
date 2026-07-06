/**
 * Tenant Payroll Periods (WS5 — MOVE parity).
 *
 * A (branch, [period_start, period_end)) commission window that can be frozen
 * so back-dated corrections can't land in a settled month. The window pair is
 * the half-open interval from deriveCycleBounds (UTC), keyed by the branch
 * hierarchy node. `branch_node_id` is a plain uuid (no FK — matches the
 * cross-cutting branch-scoped column precedent). A row's absence = open; a
 * present row's `state` is the authority.
 */

import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const payrollPeriods = pgTable(
	"payroll_periods",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: text("organization_id"),
		branchNodeId: uuid("branch_node_id").notNull(),
		/** Half-open [period_start, period_end) — snapshot at lock time. */
		periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
		periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
		/** 'open' | 'locked'. */
		state: text("state").notNull().default("open"),
		lockedAt: timestamp("locked_at", { withTimezone: true }),
		lockedBy: text("locked_by"),
		/** 'auto' | 'manual'. */
		lockKind: text("lock_kind"),
		unlockReason: text("unlock_reason"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		branchWindowIdx: uniqueIndex("payroll_periods_branch_window_idx").on(
			t.branchNodeId,
			t.periodStart,
			t.periodEnd,
		),
		branchStartIdx: index("payroll_periods_branch_start_idx").on(
			t.branchNodeId,
			t.periodStart,
		),
	}),
);
