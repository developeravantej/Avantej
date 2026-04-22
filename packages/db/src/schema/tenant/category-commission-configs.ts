import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { serviceCategories } from "./service-categories";

export const categoryCommissionConfigs = pgTable("category_commission_configs", {
	id: uuid("id").primaryKey().defaultRandom(),
	categoryId: uuid("category_id")
		.notNull()
		.references(() => serviceCategories.id, { onDelete: "cascade" }),
	paymentType: text("payment_type").notNull(), // "fixed" | "variable"
	isConditional: boolean("is_conditional").notNull().default(false),
	maxCoaches: integer("max_coaches").notNull().default(1),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	categoryUnique: uniqueIndex("category_commission_configs_category_unique").on(table.categoryId),
}));
