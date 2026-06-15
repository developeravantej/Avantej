import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { serviceCategories } from "./service-categories";

export const categoryCommissionConfigs = pgTable(
	"category_commission_configs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => serviceCategories.id, { onDelete: "cascade" }),
		paymentType: text("payment_type").notNull(), // "fixed" | "variable"
		isConditional: boolean("is_conditional").notNull().default(false),
		maxCoaches: integer("max_coaches").notNull().default(1),
		// Agent 3.4 — Phase 3 §5: commission caps/floors.
		// Maximum total commission per trainer per cycle (calendar month based on earnedAt)
		// in integer cents. NULL = uncapped (default).
		maxPerCycleCents: integer("max_per_cycle_cents"),
		// Discount-threshold opt-out — basis points (consistent with promotions.value).
		// e.g. 2000 = 20%. When set and the parent sales order's effective discount %
		// exceeds this value, no commission split is created for the line.
		// NULL = no exclusion (default).
		excludeIfDiscountAbovePct: integer("exclude_if_discount_above_pct"),
		// Migration 0046 — per-split cap/floor in cents.
		// capAmountCents: individual split ceiling per transaction (null = uncapped).
		// floorAmountCents: individual split minimum per transaction (null = no floor).
		capAmountCents: integer("cap_amount_cents"),
		floorAmountCents: integer("floor_amount_cents"),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		categoryUnique: uniqueIndex(
			"category_commission_configs_category_unique",
		).on(table.categoryId),
	}),
);
