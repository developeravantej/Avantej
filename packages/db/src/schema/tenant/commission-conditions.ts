import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { categoryCommissionConfigs } from "./category-commission-configs";

export const commissionConditions = pgTable("commission_conditions", {
	id: uuid("id").primaryKey().defaultRandom(),
	configId: uuid("config_id")
		.notNull()
		.references(() => categoryCommissionConfigs.id, { onDelete: "cascade" }),
	conditionIndex: integer("condition_index").notNull(), // Display order; lowest index = POS default
	operator: text("operator").notNull(), // "lt" | "lte" | "gt" | "gte" | "eq" | "between"
	threshold: integer("threshold").notNull(),
	thresholdMax: integer("threshold_max"), // Only for operator="between"
	label: text("label"),
	// Flaw #7: POS quantity tier — NULL means "matches any quantity" (catch-all / first-condition-wins)
	minQuantity: integer("min_quantity"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	configConditionUnique: uniqueIndex("conditions_config_index_unique").on(table.configId, table.conditionIndex),
	configIdx: index("conditions_config_idx").on(table.configId),
	// Mirror of tenant migration 0066: a 'between' condition with reversed
	// or missing thresholdMax silently never matches and zero-pays its tier.
	betweenRangeValid: check(
		"commission_conditions_between_range_valid",
		sql`${table.operator} <> 'between' OR (${table.thresholdMax} IS NOT NULL AND ${table.thresholdMax} >= ${table.threshold})`,
	),
}));
