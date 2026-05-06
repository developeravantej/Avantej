import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";

export const brands = pgTable("brands", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
	createdBy: text("created_by"),
	updatedBy: text("updated_by"),
}, (table) => ({
	nameUnique: unique("brands_name_unique").on(table.name),
	nameIdx: index("brands_name_idx").on(table.name),
}));
