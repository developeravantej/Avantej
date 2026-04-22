import { pgTable, uuid, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { commissionConditions } from "./commission-conditions";
import { trainerTiers } from "./trainer-tiers";

export const commissionConditionRates = pgTable("commission_condition_rates", {
	id: uuid("id").primaryKey().defaultRandom(),
	conditionId: uuid("condition_id")
		.notNull()
		.references(() => commissionConditions.id, { onDelete: "cascade" }),
	trainerTierId: uuid("trainer_tier_id")
		.notNull()
		.references(() => trainerTiers.id, { onDelete: "restrict" }),
	// Same encoding as commission_tier_rates.amount
	amount: integer("amount").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	conditionTierUnique: uniqueIndex("condition_rates_condition_tier_unique").on(table.conditionId, table.trainerTierId),
	conditionIdx: index("condition_rates_condition_idx").on(table.conditionId),
}));
