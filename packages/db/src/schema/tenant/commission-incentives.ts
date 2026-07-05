/**
 * Commission Incentives Schema (UAT §12 — incentive thresholds)
 *
 * Two tables:
 *  - commission_incentives        : the RULES ("a Senior sales closer who books
 *                                    > RM X in confirmed sales this month earns Y")
 *  - commission_incentive_awards  : the idempotent AWARD ledger. One row per
 *                                    (rule, staff, period). The UNIQUE key makes
 *                                    the period sweep exactly-once — a re-run can
 *                                    never double-pay a bonus.
 *
 * Multi-tenant: both tables live in each tenant's Neon branch.
 * Amounts are integer cents (fixed bonus) or basis points (percentage bonus).
 */

import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { trainerTiers } from "./trainer-tiers";

// Local type aliases — canonical definitions in @avantej-core/types.
type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";
type IncentivePeriodType = "monthly";
type IncentiveBonusType = "fixed" | "pct";

export const commissionIncentives = pgTable(
	"commission_incentives",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		/** Which role the rule rewards. */
		roleType: text("role_type")
			.notNull()
			.default("sales")
			.$type<CommissionRoleType>(),
		/** Optional tier restriction. NULL = all tiers of the role. */
		trainerTierId: uuid("trainer_tier_id").references(() => trainerTiers.id, {
			onDelete: "set null",
		}),
		/** Aggregation window. Only "monthly" is supported in v1. */
		periodType: text("period_type")
			.notNull()
			.default("monthly")
			.$type<IncentivePeriodType>(),
		/** Qualifying confirmed-sales volume (cents) the staff must cross. */
		thresholdCents: integer("threshold_cents").notNull(),
		/** "fixed" = bonusValue is cents; "pct" = bonusValue is basis points of volume. */
		bonusType: text("bonus_type")
			.notNull()
			.default("fixed")
			.$type<IncentiveBonusType>(),
		/** Integer cents (fixed) or basis points (pct, e.g. 500 = 5%). */
		bonusValue: integer("bonus_value").notNull(),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		activeIdx: index("commission_incentives_active_idx").on(table.isActive),
		roleIdx: index("commission_incentives_role_idx").on(table.roleType),
	}),
);

export const commissionIncentiveAwards = pgTable(
	"commission_incentive_awards",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		incentiveId: uuid("incentive_id")
			.notNull()
			.references(() => commissionIncentives.id, { onDelete: "cascade" }),
		/** members.userId (cross-DB style — plain text, no FK). */
		staffId: text("staff_id").notNull(),
		/** Period bucket key, e.g. "2026-06" for monthly. Part of the idempotency key. */
		periodKey: text("period_key").notNull(),
		/** Snapshot of the staff's qualifying volume when the award fired (cents). */
		qualifyingTotalCents: integer("qualifying_total_cents").notNull(),
		/** Snapshot of the threshold that was crossed (cents). */
		thresholdCents: integer("threshold_cents").notNull(),
		/** The awarded bonus (cents). */
		bonusCents: integer("bonus_cents").notNull(),
		awardedAt: timestamp("awarded_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		// Idempotency: exactly one award per (rule, staff, period). The sweep uses
		// ON CONFLICT DO NOTHING against this so re-runs never double-pay.
		uniqueAward: uniqueIndex("commission_incentive_awards_unique").on(
			table.incentiveId,
			table.staffId,
			table.periodKey,
		),
		staffIdx: index("commission_incentive_awards_staff_idx").on(table.staffId),
		periodIdx: index("commission_incentive_awards_period_idx").on(
			table.periodKey,
		),
	}),
);
