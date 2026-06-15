/**
 * Commission Cycle Configs (S-cycle-window-alignment)
 *
 * Defines the commission-cap CYCLE window used by `applyCommissionCaps` when
 * enforcing `category_commission_configs.maxPerCycleCents`. Without this table
 * the cap defaulted to UTC calendar-month bounds, which silently mis-aligned
 * with finance teams running 22nd→22nd (semi-monthly) or other non-standard
 * payout periods.
 *
 * Lookup rule (resolver in `packages/services/src/commission-cycle.service.ts`):
 *   1. Try branch-specific row    (branchId = X)
 *   2. Fall back to tenant-wide   (branchId IS NULL)
 *   3. Fall back to UTC calendar  (no row)
 *
 * Cycle types:
 *   - "calendar_month"     anchorDay ignored (1st-to-last-day-of-month, UTC)
 *   - "monthly_anchored"   anchorDay 1..28 (e.g. 22 → 22nd-to-22nd)
 *   - "semi_monthly"       anchorDay 1..15 (e.g. 1 → 1st-15th + 16th-end)
 *   - "weekly"             anchorDay 0..6 (Sun..Sat; cycle starts on that weekday)
 *
 * One config per (branchId | NULL) — UNIQUE constraint enforces this.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const commissionCycleConfigs = pgTable(
	"commission_cycle_configs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// NULL = tenant-wide default. UUID = branch override.
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "cascade",
		}),
		cycleType: text("cycle_type").notNull(), // calendar_month | monthly_anchored | semi_monthly | weekly
		anchorDay: integer("anchor_day"), // 1..28 for monthly_anchored; 1..15 for semi_monthly; 0..6 for weekly; NULL for calendar_month
		updatedBy: text("updated_by"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => ({
		// At most ONE row per (branchId | NULL). The UNIQUE constraint coalesces
		// NULL so two tenant-wide rows would conflict; branch rows are unique
		// per branch.
		branchUniqueIdx: uniqueIndex(
			"commission_cycle_configs_branch_unique_idx",
		).on(t.branchId),
		branchIdx: index("commission_cycle_configs_branch_idx").on(t.branchId),
	}),
);
