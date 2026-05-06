/**
 * Tenant Supplier Invoices Schema (Agent 2.11)
 *
 * Tracks supplier invoices for 3-way match: PO total ≈ receipt total ≈
 * invoice total within tolerance. Status workflow:
 *   pending -> matched | disputed
 *   matched -> paid
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { suppliers } from "./suppliers";
import { purchaseOrders } from "./purchase-orders";
import { goodsReceipts } from "./goods-receipts";

export const supplierInvoices = pgTable(
	"supplier_invoices",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		invoiceNumber: text("invoice_number").notNull(),
		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id, { onDelete: "restrict" }),
		purchaseOrderId: uuid("purchase_order_id").references(
			() => purchaseOrders.id,
			{ onDelete: "set null" },
		),
		goodsReceiptId: uuid("goods_receipt_id").references(
			() => goodsReceipts.id,
			{ onDelete: "set null" },
		),
		totalCents: integer("total_cents").notNull(),
		taxCents: integer("tax_cents").default(0).notNull(),
		invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
		dueDate: timestamp("due_date", { withTimezone: true }),
		// pending | matched | paid | disputed
		status: text("status").notNull().default("pending"),
		matchedAt: timestamp("matched_at", { withTimezone: true }),
		matchedBy: text("matched_by"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => ({
		poIdx: index("supplier_invoices_po_idx").on(t.purchaseOrderId),
		receiptIdx: index("supplier_invoices_receipt_idx").on(t.goodsReceiptId),
		supplierIdx: index("supplier_invoices_supplier_idx").on(t.supplierId),
		invoiceNumberUnique: uniqueIndex("supplier_invoices_number_unique").on(
			t.supplierId,
			t.invoiceNumber,
		),
	}),
);
