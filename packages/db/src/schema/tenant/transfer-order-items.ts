import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { transferOrders } from "./transfer-orders";
import { products } from "./products";

export const transferOrderItems = pgTable("transfer_order_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	transferOrderId: uuid("transfer_order_id")
		.notNull()
		.references(() => transferOrders.id, { onDelete: "cascade" }),
	productId: uuid("product_id")
		.notNull()
		.references(() => products.id, { onDelete: "restrict" }),
	quantityTransferred: integer("quantity_transferred").notNull(),
	quantityReceived: integer("quantity_received").default(0).notNull(),
	notes: text("notes"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	transferOrderIdIdx: index("transfer_order_items_order_idx").on(table.transferOrderId),
	productIdIdx: index("transfer_order_items_product_idx").on(table.productId),
}));
