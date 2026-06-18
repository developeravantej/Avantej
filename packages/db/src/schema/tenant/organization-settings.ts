import {
	pgTable,
	uuid,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const organizationSettings = pgTable(
	"organization_settings",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		key: text("key").notNull().unique(),
		value: text("value").notNull(),
		updatedBy: text("updated_by"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [uniqueIndex("organization_settings_key_idx").on(table.key)],
);
