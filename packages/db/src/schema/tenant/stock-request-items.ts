import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { stockRequests } from "./stock-requests";
import { products } from "./products";

export const stockRequestItems = pgTable("stock_request_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	stockRequestId: uuid("stock_request_id")
		.notNull()
		.references(() => stockRequests.id, { onDelete: "cascade" }),
	productId: uuid("product_id")
		.notNull()
		.references(() => products.id, { onDelete: "restrict" }),
	quantityRequested: integer("quantity_requested").notNull(),
	quantityFulfilled: integer("quantity_fulfilled").default(0).notNull(),
	// Migration 0046 — approved quantity (may differ from requested; null = not yet reviewed)
	approvedQty: integer("approved_qty"),
	notes: text("notes"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	stockRequestIdIdx: index("stock_request_items_request_idx").on(table.stockRequestId),
	productIdIdx: index("stock_request_items_product_idx").on(table.productId),
}));
