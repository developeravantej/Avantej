import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
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
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	configConditionUnique: uniqueIndex("conditions_config_index_unique").on(table.configId, table.conditionIndex),
	configIdx: index("conditions_config_idx").on(table.configId),
}));
