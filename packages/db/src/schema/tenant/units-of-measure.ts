import { pgTable, uuid, text, timestamp, numeric, index, unique } from "drizzle-orm/pg-core";

export const unitsOfMeasure = pgTable("units_of_measure", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	description: text("description"),
	// Self-referential: null = this IS the base unit
	baseUomId: uuid("base_uom_id").references((): any => unitsOfMeasure.id, { onDelete: "restrict" }),
	// How many base units equal one of this UoM
	conversionFactor: numeric("conversion_factor", { precision: 12, scale: 4 }).default("1").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	nameUnique: unique("uom_name_unique").on(table.name),
	nameIdx: index("uom_name_idx").on(table.name),
	baseUomIdIdx: index("uom_base_uom_idx").on(table.baseUomId),
}));
