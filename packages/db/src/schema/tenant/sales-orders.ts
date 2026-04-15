import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const salesOrders = pgTable("sales_orders", {
	id: uuid("id").primaryKey().defaultRandom(),
	salesOrderNumber: text("sales_order_number").notNull().unique(),
	date: timestamp("date").notNull(),
	customerId: text("customer_id"),
	customerName: text("customer_name").notNull(),
	// "member" = customerId is member.userId | "walk_in" = customerId is walk_in_customers.id
	customerType: text("customer_type").notNull().default("member"),
	createdBy: text("created_by").notNull(),
	branchId: uuid("branch_id")
		.notNull()
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	status: text("status").default("draft").notNull(),
	// "draft" | "confirmed" | "completed" | "cancelled"
	totalAmount: integer("total_amount").notNull(),
	notes: text("notes"),
	// Cancellation metadata (populated when status = "cancelled")
	cancellationNumber: text("cancellation_number").unique(),
	cancellationDate: timestamp("cancellation_date"),
	cancellationReason: text("cancellation_reason"),
	cancelledBy: text("cancelled_by"),
	cancelledAmount: integer("cancelled_amount"), // Partial or full refund amount in cents

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	salesOrderNumberIdx: index("sales_orders_number_idx").on(table.salesOrderNumber),
	customerIdIdx: index("sales_orders_customer_idx").on(table.customerId),
	createdByIdx: index("sales_orders_created_by_idx").on(table.createdBy),
	branchIdIdx: index("sales_orders_branch_idx").on(table.branchId),
	dateIdx: index("sales_orders_date_idx").on(table.date),
	statusIdx: index("sales_orders_status_idx").on(table.status),
	customerTypeIdx: index("sales_orders_customer_type_idx").on(table.customerType),
	cancellationNumberIdx: index("sales_orders_cancellation_number_idx").on(table.cancellationNumber),
	cancellationDateIdx: index("sales_orders_cancellation_date_idx").on(table.cancellationDate),
}));
