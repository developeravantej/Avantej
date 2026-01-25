// packages/db/src/schema/tenant/payment-items.ts

/**
 * Tenant Payment Items Schema
 *
 * Line items for payments (order breakdown).
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { payments } from "./payments";

export const paymentItems = pgTable("payment_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	paymentId: uuid("payment_id")
		.notNull()
		.references(() => payments.id, { onDelete: "cascade" }),

	itemType: text("item_type").notNull(), // "package" | "booking" | "tax" | "fee" | "discount"
	itemId: uuid("item_id"),

	description: text("description").notNull(),
	quantity: integer("quantity").default(1).notNull(),
	unitPrice: integer("unit_price").notNull(),
	totalPrice: integer("total_price").notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	paymentIdIdx: index("payment_items_payment_idx").on(table.paymentId),
	itemTypeIdx: index("payment_items_type_idx").on(table.itemType),
	itemIdIdx: index("payment_items_item_idx").on(table.itemId),
}));
