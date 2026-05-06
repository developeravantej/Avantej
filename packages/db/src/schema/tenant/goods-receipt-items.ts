/**
 * Tenant Goods Receipt Items Schema (Agent 2.11)
 *
 * Per-line receipt detail. Each row links back to the originating
 * purchase_order_item so the 3-way match can JOIN po_items.unitCost for
 * the receipt total.
 */

import { pgTable, uuid, integer, text, index } from "drizzle-orm/pg-core";
import { goodsReceipts } from "./goods-receipts";
import { purchaseOrderItems } from "./purchase-orders";
import { products } from "./products";

export const goodsReceiptItems = pgTable(
	"goods_receipt_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		goodsReceiptId: uuid("goods_receipt_id")
			.notNull()
			.references(() => goodsReceipts.id, { onDelete: "cascade" }),
		purchaseOrderItemId: uuid("purchase_order_item_id")
			.notNull()
			.references(() => purchaseOrderItems.id, { onDelete: "restrict" }),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "restrict" }),
		quantityReceived: integer("quantity_received").notNull(),
		quantityDamaged: integer("quantity_damaged").default(0).notNull(),
		notes: text("notes"),
	},
	(t) => ({
		receiptIdx: index("goods_receipt_items_receipt_idx").on(t.goodsReceiptId),
		poItemIdx: index("goods_receipt_items_po_item_idx").on(
			t.purchaseOrderItemId,
		),
	}),
);
