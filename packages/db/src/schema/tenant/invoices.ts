import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { salesOrders } from "./sales-orders";

export const invoices = pgTable("invoices", {
	id: uuid("id").primaryKey().defaultRandom(),
	invoiceNumber: text("invoice_number").notNull().unique(),
	salesOrderId: uuid("sales_order_id")
		.references(() => salesOrders.id, { onDelete: "set null" }),
	// payment_id FK to payments.id — add after payments is confirmed (circular import avoidance)
	paymentId: uuid("payment_id"),
	date: timestamp("date").notNull(),
	dueDate: timestamp("due_date"),
	customerId: text("customer_id"),         // members.userId (text, no FK)
	customerName: text("customer_name").notNull(),
	createdBy: text("created_by").notNull(), // members.userId (text, no FK)
	paymentMode: text("payment_mode"),
	// "credit_card" | "bank_transfer" | "cash" | "upi" | "card" | "apple_pay" | "google_pay"
	totalAmount: integer("total_amount").notNull(),
	amountPaid: integer("amount_paid").default(0).notNull(),
	status: text("status").notNull(),
	// "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled"
	eInvoiceStatus: text("e_invoice_status"),
	// "pending" | "generated" | "failed" — nullable
	eInvoiceId: text("e_invoice_id"),        // LHDN MyInvois UUID — nullable
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	invoiceNumberIdx: index("invoices_number_idx").on(table.invoiceNumber),
	salesOrderIdIdx: index("invoices_sales_order_idx").on(table.salesOrderId),
	paymentIdIdx: index("invoices_payment_idx").on(table.paymentId),
	customerIdIdx: index("invoices_customer_idx").on(table.customerId),
	statusIdx: index("invoices_status_idx").on(table.status),
	eInvoiceStatusIdx: index("invoices_e_invoice_status_idx").on(table.eInvoiceStatus),
	dateIdx: index("invoices_date_idx").on(table.date),
}));
