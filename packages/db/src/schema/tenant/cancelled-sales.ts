import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { salesOrders } from "./sales-orders";
import { invoices } from "./invoices";

export const cancelledSales = pgTable("cancelled_sales", {
	id: uuid("id").primaryKey().defaultRandom(),
	cancellationNumber: text("cancellation_number").notNull().unique(),
	salesOrderId: uuid("sales_order_id")
		.notNull()
		.references(() => salesOrders.id, { onDelete: "restrict" }),
	invoiceId: uuid("invoice_id")
		.references(() => invoices.id, { onDelete: "set null" }),
	cancellationDate: timestamp("cancellation_date").notNull(),
	cancelledAmount: integer("cancelled_amount").notNull(),
	cancellationReason: text("cancellation_reason"),
	cancelledBy: text("cancelled_by").notNull(), // members.userId (text, no FK)
	customerId: text("customer_id"),             // members.userId (text, no FK)
	customerName: text("customer_name").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	cancellationNumberIdx: index("cancelled_sales_number_idx").on(table.cancellationNumber),
	salesOrderIdIdx: index("cancelled_sales_order_idx").on(table.salesOrderId),
	customerIdIdx: index("cancelled_sales_customer_idx").on(table.customerId),
	cancellationDateIdx: index("cancelled_sales_date_idx").on(table.cancellationDate),
}));
