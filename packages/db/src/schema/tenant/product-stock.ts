import {
	pgTable,
	uuid,
	timestamp,
	integer,
	index,
	unique,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { hierarchyNodes } from "./hierarchy";

export const productStock = pgTable(
	"product_stock",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		branchId: uuid("branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
		quantity: integer("quantity").default(0).notNull(),
		minStockLevel: integer("min_stock_level"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		productBranchUnique: unique("product_stock_product_branch_unique").on(
			table.productId,
			table.branchId,
		),
		productIdIdx: index("product_stock_product_idx").on(table.productId),
		branchIdIdx: index("product_stock_branch_idx").on(table.branchId),
	}),
);
