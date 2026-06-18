import {
	pgTable,
	uuid,
	integer,
	text,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { packageInstances } from "./package-instances";
import { salesOrders } from "./sales-orders";

export const installments = pgTable(
	"installments",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		packageInstanceId: uuid("package_instance_id")
			.notNull()
			.references(() => packageInstances.id, { onDelete: "cascade" }),
		// Reconciliation link back to the sales_order that created this schedule (0051)
		salesOrderId: uuid("sales_order_id").references(() => salesOrders.id),
		installmentNumber: integer("installment_number").notNull(),
		amount: integer("amount").notNull(),
		taxAmount: integer("tax_amount").default(0).notNull(),
		status: text("status").notNull(), // 'pending' | 'paid' | 'overdue' | 'cancelled' | 'waived'
		dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		paymentMethod: text("payment_method"), // 'manual_transfer' | 'cash'
		confirmedBy: text("confirmed_by"),
		creditsUnlockedByThis: integer("credits_unlocked_by_this").notNull(),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("installments_package_instance_idx").on(table.packageInstanceId),
		index("installments_status_idx").on(table.status),
		index("installments_due_date_idx").on(table.dueDate),
		index("installments_sales_order_id_idx").on(table.salesOrderId),
		index("idx_installments_pkg_status_due").on(
			table.packageInstanceId,
			table.status,
			table.dueDate,
		),
		uniqueIndex("installments_package_number_unq").on(
			table.packageInstanceId,
			table.installmentNumber,
		),
	],
);
