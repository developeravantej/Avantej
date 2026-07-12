/**
 * Tenant Receipts
 *
 * One receipt per invoice (unique index on invoice_id). The receipt number is
 * stable for the life of the invoice; when the paid-payment set changes (a
 * later installment is confirmed), the lines/total are re-snapshotted in
 * place and updated_at is bumped — the number never changes. Payment lines
 * are stored as a jsonb snapshot because a receipt is a point-in-time legal
 * document: it must not drift when source rows are edited.
 *
 * Cross-DB note: customer_id / created_by reference control-panel users
 * (members.userId) — text, no FK. invoice_number is snapshotted for display
 * should the invoice link ever be severed (ON DELETE SET NULL).
 */

import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { invoices } from "./invoices";

/** One payment covered by a receipt, snapshotted at issue/refresh time. */
export type ReceiptLine = {
	/** ISO timestamp of the payment. */
	date: string;
	/** Human method label source: "cash" | "card" | "manual_transfer" | ... */
	method: string;
	/** Free-text reference: payment number, description, or installment label. */
	reference: string;
	amountCents: number;
};

export const receipts = pgTable(
	"receipts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		receiptNumber: text("receipt_number").notNull().unique(),
		invoiceId: uuid("invoice_id").references(() => invoices.id, {
			onDelete: "set null",
		}),
		invoiceNumber: text("invoice_number"),
		branchId: uuid("branch_id"),
		date: timestamp("date", { withTimezone: true }).notNull(),
		customerId: text("customer_id"),
		customerName: text("customer_name").notNull(),
		totalAmount: integer("total_amount").notNull(),
		lines: jsonb("lines").$type<ReceiptLine[]>().notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		invoiceUnique: uniqueIndex("receipts_invoice_unique").on(table.invoiceId),
		branchIdx: index("receipts_branch_idx").on(table.branchId),
	}),
);
