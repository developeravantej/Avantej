import {
	pgTable,
	uuid,
	integer,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { categoryCommissionConfigs } from "./category-commission-configs";
import { trainerTiers } from "./trainer-tiers";

export const commissionTierRates = pgTable(
	"commission_tier_rates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		configId: uuid("config_id")
			.notNull()
			.references(() => categoryCommissionConfigs.id, { onDelete: "cascade" }),
		trainerTierId: uuid("trainer_tier_id")
			.notNull()
			.references(() => trainerTiers.id, { onDelete: "restrict" }),
		// For paymentType="fixed": cents (e.g., 5000 = RM50)
		// For paymentType="variable": basis points (e.g., 1000 = 10%)
		amount: integer("amount").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		configTierUnique: uniqueIndex("tier_rates_config_tier_unique").on(
			table.configId,
			table.trainerTierId,
		),
		configIdx: index("tier_rates_config_idx").on(table.configId),
	}),
);
