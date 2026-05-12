/**
 * Tenant Goods Receipts Schema (Agent 2.11 — schema-relationship-fixes §8.5)
 *
 * Records physical receipt of goods against a purchase order. Posting a
 * receipt is the canonical write-through path for inventory deltas
 * (product_stock).
 *
 * Status workflow: draft -> posted -> cancelled
 *   - posted: stock has been incremented, PO receivedQty bumped
 *   - cancelled: stock reverted (only allowed from posted)
 */

import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { purchaseOrders } from "./purchase-orders";

export const goodsReceipts = pgTable(
	"goods_receipts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		receiptNumber: text("receipt_number").notNull(),
		purchaseOrderId: uuid("purchase_order_id")
			.notNull()
			.references(() => purchaseOrders.id, { onDelete: "restrict" }),
		branchId: uuid("branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
		receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
		// member.userId — cross-database reference, no FK
		receivedBy: text("received_by").notNull(),
		// draft | posted | cancelled
		status: text("status").notNull().default("draft"),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => ({
		poIdx: index("goods_receipts_po_idx").on(t.purchaseOrderId),
		receiptNumberUnique: uniqueIndex("goods_receipts_number_unique").on(
			t.receiptNumber,
		),
	}),
);
