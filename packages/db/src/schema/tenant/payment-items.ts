// packages/db/src/schema/tenant/payment-items.ts

/**
 * Tenant Payment Items Schema
 *
 * Line items for payments (order breakdown).
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

import { payments } from "./payments";
import { promotions } from "./promotions";
import { taxRates } from "./tax-rates";

export const paymentItems = pgTable("payment_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	paymentId: uuid("payment_id")
		.notNull()
		.references(() => payments.id, { onDelete: "cascade" }),

	itemType: text("item_type").notNull(), // "package" | "booking" | "tax" | "fee" | "discount"
	itemId: uuid("item_id"),

	// Optional link to a promotion that was applied for this line item.
	// Agent 2.10 (audit-driven §8.5): FK enforcement added. The earlier "circular
	// dependency" concern is moot — promotions has no FK back to payment_items.
	// On promotion delete, promotion_id is set to null so historical line items
	// remain intact for receipts/audits.
	promotionId: uuid("promotion_id").references(() => promotions.id, { onDelete: "set null" }),

	// Agent 2.3 — Phase 2 Wave 3b — Journey J2: tax-rate snapshot for type='tax' line.
	// Captured at payment creation so historical receipts reproduce the applied rate
	// even after the underlying tax_rates row is edited or deactivated.
	taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),

	description: text("description").notNull(),
	quantity: integer("quantity").default(1).notNull(),
	unitPrice: integer("unit_price").notNull(),
	totalPrice: integer("total_price").notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	paymentIdIdx: index("payment_items_payment_idx").on(table.paymentId),
	itemTypeIdx: index("payment_items_type_idx").on(table.itemType),
	itemIdIdx: index("payment_items_item_idx").on(table.itemId),
	promotionIdIdx: index("payment_items_promotion_idx").on(table.promotionId),
	taxRateIdIdx: index("payment_items_tax_rate_idx").on(table.taxRateId),
}));
