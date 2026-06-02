import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	boolean,
	index,
	pgEnum,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { walkInCustomers } from "./walk-in-customers";

export const salesOrderRefundStatusEnum = pgEnum("sales_order_refund_status", [
	"none",
	"pending",
	"partial",
	"processed",
]);

export const cancellationReasonCategoryEnum = pgEnum(
	"cancellation_reason_category",
	[
		"customer_changed_mind",
		"payment_failed",
		"wrong_item",
		"fraud_suspected",
		"system_error",
		"other",
	],
);

export const salesOrders = pgTable(
	"sales_orders",
	{
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
		// Agent 3.3 — Phase 3 §5: comp tracking. When non-null, the order is
		// complimentary (manager-marked on POS) and all lines are excluded from
		// commission split creation. Free-form reason for audit/visibility.
		complimentaryReason: text("complimentary_reason"),
		// Migration 0046 — structured complimentary flag + approval tracking.
		// isComplimentary: boolean flag (quick filter without null-check on complimentaryReason).
		// complimentaryApprovedBy: members.userId who authorised the comp order.
		// walkInCustomerId: explicit FK to walk_in_customers for walk-in sales orders
		//   (supplements the text customerType/"walk_in" pattern with a typed FK).
		isComplimentary: boolean("is_complimentary").notNull().default(false),
		complimentaryApprovedBy: text("complimentary_approved_by"),
		walkInCustomerId: uuid("walk_in_customer_id").references(
			() => walkInCustomers.id,
			{ onDelete: "restrict" },
		),
		// Migration 0054
		refundStatus: salesOrderRefundStatusEnum("refund_status")
			.notNull()
			.default("none"),
		refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
		// Migration 0055
		cancellationReasonCategory: cancellationReasonCategoryEnum(
			"cancellation_reason_category",
		),

		// Migration 0086 — origination commission attribution.
		// sold_by: cross-DB userId of the closer (salesperson who converted the deal).
		// lead_source_user_id: cross-DB userId of the lead source (referrer/marketing).
		// Both are plain text (NO FK constraint) — cross-DB user references.
		// NULL for historical rows — no backfill (cashier ≠ closer).
		soldBy: text("sold_by"),
		leadSourceUserId: text("lead_source_user_id"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		salesOrderNumberIdx: index("sales_orders_number_idx").on(
			table.salesOrderNumber,
		),
		customerIdIdx: index("sales_orders_customer_idx").on(table.customerId),
		createdByIdx: index("sales_orders_created_by_idx").on(table.createdBy),
		branchIdIdx: index("sales_orders_branch_idx").on(table.branchId),
		dateIdx: index("sales_orders_date_idx").on(table.date),
		statusIdx: index("sales_orders_status_idx").on(table.status),
		customerTypeIdx: index("sales_orders_customer_type_idx").on(
			table.customerType,
		),
		cancellationNumberIdx: index("sales_orders_cancellation_number_idx").on(
			table.cancellationNumber,
		),
		cancellationDateIdx: index("sales_orders_cancellation_date_idx").on(
			table.cancellationDate,
		),
		walkInCustomerIdx: index("sales_orders_walk_in_customer_idx").on(
			table.walkInCustomerId,
		),
		// Composite: customer 360 view — customer orders sorted by date
		customerCreatedIdx: index("sales_orders_customer_created_idx").on(
			table.customerId,
			table.createdAt,
		),
		// Migration 0086: origination attribution index (partial — NULL rows excluded)
		soldByIdx: index("sales_orders_sold_by_idx").on(table.soldBy),
	}),
);
