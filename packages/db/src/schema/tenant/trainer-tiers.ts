import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// Local type alias — canonical definition in @avantej-core/types CommissionRoleType
type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";

export const trainerTiers = pgTable(
	"trainer_tiers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		description: text("description"),
		rank: integer("rank").notNull().default(0),
		isActive: boolean("is_active").notNull().default(true),
		// Migration 0083: role dimension for multi-track commission support.
		// Default 'trainer' preserves all existing rows without a data migration.
		roleType: text("role_type")
			.notNull()
			.default("trainer")
			.$type<CommissionRoleType>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		nameIdx: index("trainer_tiers_name_idx").on(table.name),
		rankIdx: index("trainer_tiers_rank_idx").on(table.rank),
		nameUnique: uniqueIndex("trainer_tiers_name_unique").on(table.name),
	}),
);
