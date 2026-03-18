import { pgTable, uuid, text, timestamp, integer, numeric, index, unique } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { productCategories } from "./product-categories";
import { suppliers } from "./suppliers";
import { unitsOfMeasure } from "./units-of-measure";

export const products = pgTable("products", {
	id: uuid("id").primaryKey().defaultRandom(),
	sku: text("sku").notNull(),
	name: text("name").notNull(),
	barcode: text("barcode"),
	type: text("type").default("product").notNull(), // "product" | "service_item"
	brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
	categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
	supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
	uomId: uuid("uom_id")
		.notNull()
		.references(() => unitsOfMeasure.id, { onDelete: "restrict" }),
	conversionFactor: numeric("conversion_factor", { precision: 12, scale: 4 }).default("1").notNull(),
	price: integer("price").notNull(), // selling price in cents
	status: text("status").default("active").notNull(), // "active" | "inactive" | "discontinued"
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	skuUnique: unique("products_sku_unique").on(table.sku),
	skuIdx: index("products_sku_idx").on(table.sku),
	barcodeIdx: index("products_barcode_idx").on(table.barcode),
	brandIdIdx: index("products_brand_idx").on(table.brandId),
	categoryIdIdx: index("products_category_idx").on(table.categoryId),
	supplierIdIdx: index("products_supplier_idx").on(table.supplierId),
	statusIdx: index("products_status_idx").on(table.status),
}));
