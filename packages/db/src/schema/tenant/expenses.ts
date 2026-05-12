// packages/db/src/schema/tenant/expenses.ts

/**
 * Tenant Expenses Schema
 *
 * Expense/claim tracking for staff reimbursements.
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const expenses = pgTable("expenses", {
	id: uuid("id").primaryKey().defaultRandom(),

	branchId: uuid("branch_id")
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),

	submittedBy: text("submitted_by").notNull(),

	amount: integer("amount").notNull(),
	currency: text("currency").default("myr").notNull(),

	category: text("category").notNull(), // "travel" | "equipment" | "supplies" | "training" | "other"
	description: text("description").notNull(),
	receiptUrl: text("receipt_url"),

	expenseDate: timestamp("expense_date").notNull(),

	status: text("status").default("pending").notNull(), // "pending" | "approved" | "rejected" | "paid"

	approvedBy: text("approved_by"),
	approvedAt: timestamp("approved_at"),
	rejectionReason: text("rejection_reason"),

	paidAt: timestamp("paid_at"),
	paidBy: text("paid_by"),
	paymentReference: text("payment_reference"),

	notes: text("notes"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	branchIdIdx: index("expenses_branch_idx").on(table.branchId),
	submittedByIdx: index("expenses_submitted_by_idx").on(table.submittedBy),
	statusIdx: index("expenses_status_idx").on(table.status),
	categoryIdx: index("expenses_category_idx").on(table.category),
	expenseDateIdx: index("expenses_date_idx").on(table.expenseDate),
	submitterStatusIdx: index("expenses_submitter_status_idx")
		.on(table.submittedBy, table.status),
}));
