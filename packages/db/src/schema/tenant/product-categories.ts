import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";

export const productCategories = pgTable("product_categories", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	externalCode: text("external_code"),
	description: text("description"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	nameUnique: unique("product_categories_name_unique").on(table.name),
	externalCodeUnique: unique("product_categories_external_code_unique").on(table.externalCode),
	nameIdx: index("product_categories_name_idx").on(table.name),
	externalCodeIdx: index("product_categories_external_code_idx").on(table.externalCode),
}));
