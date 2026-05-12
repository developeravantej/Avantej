import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { packageInstances } from "./package-instances";
import { salesOrders } from "./sales-orders";

export const refunds = pgTable(
	"refunds",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		refundNumber: text("refund_number").notNull().unique(), // RF-YYYYMMDD-NNNN
		status: text("status").notNull().default("pending"),
		// "pending" | "approved" | "rejected" | "processed" | "cancelled"

		// Targets — at least ONE must be set (enforced in service layer + DB CHECK)
		salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, {
			onDelete: "restrict",
		}),
		paymentId: uuid("payment_id"), // FK enforced via migration (avoid circular import)
		packageInstanceId: uuid("package_instance_id").references(
			() => packageInstances.id,
			{ onDelete: "restrict" },
		),

		// Amounts
		amountCents: integer("amount_cents").notNull(), // refund amount (gross — may include tax)
		taxAmountCents: integer("tax_amount_cents").notNull().default(0),

		// Lifecycle metadata
		reason: text("reason").notNull(),
		notes: text("notes"),
		requestedBy: text("requested_by").notNull(), // members.userId
		requestedAt: timestamp("requested_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		reviewedBy: text("reviewed_by"), // members.userId — populated on approve/reject
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		reviewNotes: text("review_notes"),
		processedBy: text("processed_by"), // members.userId — populated on process
		processedAt: timestamp("processed_at", { withTimezone: true }),
		refundMethod: text("refund_method"), // "cash" | "card_reversal" | "bank_transfer" | "store_credit"
		refundReference: text("refund_reference"), // bank ref, card auth, etc.

		// Branch for RBAC
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "restrict",
		}),

		// Audit / customer info (denormalized for display without cross-joins)
		customerId: text("customer_id").notNull(), // member.userId or walk_in_customers.id
		customerName: text("customer_name").notNull(),

		metadata: jsonb("metadata"), // free-form additions per refund type

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		refundNumberIdx: index("refunds_number_idx").on(table.refundNumber),
		statusIdx: index("refunds_status_idx").on(table.status),
		salesOrderIdx: index("refunds_sales_order_idx").on(table.salesOrderId),
		paymentIdx: index("refunds_payment_idx").on(table.paymentId),
		packageInstanceIdx: index("refunds_package_instance_idx").on(
			table.packageInstanceId,
		),
		branchIdx: index("refunds_branch_idx").on(table.branchId),
		customerIdx: index("refunds_customer_idx").on(table.customerId),
		requestedAtIdx: index("refunds_requested_at_idx").on(table.requestedAt),
	}),
);
