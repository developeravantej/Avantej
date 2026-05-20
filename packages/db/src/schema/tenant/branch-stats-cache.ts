/**
 * Tenant Branch Stats Cache Schema
 *
 * Write-through cache for branch-level aggregates (member counts, revenue).
 * Keyed by hierarchy_node_id (branch only). Refreshed by the branch stats service
 * on write events and periodically invalidated via a debounced recompute job.
 *
 * Migration 0059
 */

import { pgTable, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const branchStatsCache = pgTable(
	"branch_stats_cache",
	{
		hierarchyNodeId: uuid("hierarchy_node_id")
			.primaryKey()
			.references(() => hierarchyNodes.id, { onDelete: "cascade" }),
		membersCount: integer("members_count").notNull().default(0),
		staffCount: integer("staff_count").notNull().default(0),
		monthRevenueCents: integer("month_revenue_cents").notNull().default(0),
		monthRevenuePeriodStart: timestamp("month_revenue_period_start", {
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		computedAt: timestamp("computed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		computedAtIdx: index("branch_stats_cache_computed_at_idx").on(
			table.computedAt,
		),
	}),
);
