// packages/db/src/schema/tenant/purchase-orders.ts

/**
 * Tenant Purchase Orders Schema
 *
 * Tracks purchase orders sent to suppliers to restock inventory.
 * When items are received, product_stock is automatically updated by the service layer.
 *
 * Status workflow: draft → approved → ordered → partially_received → received
 *                                                                   ↘ cancelled (from draft or approved only)
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
	uniqueIndex,
	pgEnum,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { suppliers } from "./suppliers";
import { products } from "./products";

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
	"draft",
	"approved",
	"ordered",
	"partially_received",
	"received",
	"cancelled",
]);

export const purchaseOrders = pgTable(
	"purchase_orders",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Auto-generated sequential number, e.g. "PO-20260210-0001"
		purchaseOrderNumber: text("purchase_order_number").notNull(),

		// The supplier this PO is sent to
		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id, { onDelete: "restrict" }),

		// Which branch is receiving the goods
		branchId: uuid("branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "restrict" }),

		status: purchaseOrderStatusEnum("status").notNull().default("draft"),

		// When the order was placed with the supplier
		orderDate: timestamp("order_date", { withTimezone: true }).notNull(),

		// Expected arrival date (informational, not enforced)
		expectedDeliveryDate: timestamp("expected_delivery_date", {
			withTimezone: true,
		}),

		// When goods were actually received (set on final receive)
		receivedAt: timestamp("received_at", { withTimezone: true }),

		// All amounts in cents
		subtotal: integer("subtotal").notNull().default(0),
		taxAmount: integer("tax_amount").notNull().default(0),
		totalAmount: integer("total_amount").notNull().default(0),

		notes: text("notes"),

		// member.userId (text — cross-database reference, no FK to control panel)
		createdBy: text("created_by").notNull(),

		// member.userId — set when status transitions to "approved"
		approvedBy: text("approved_by"),
		approvedAt: timestamp("approved_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		purchaseOrderNumberIdx: uniqueIndex("po_number_idx").on(
			table.purchaseOrderNumber
		),
		supplierIdx: index("po_supplier_idx").on(table.supplierId),
		branchIdx: index("po_branch_idx").on(table.branchId),
		statusIdx: index("po_status_idx").on(table.status),
		orderDateIdx: index("po_order_date_idx").on(table.orderDate),
		createdByIdx: index("po_created_by_idx").on(table.createdBy),
		supplierStatusIdx: index("po_supplier_status_idx").on(
			table.supplierId,
			table.status
		),
	})
);

export const purchaseOrderItems = pgTable(
	"purchase_order_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Parent PO — cascade delete (items are owned by the PO)
		purchaseOrderId: uuid("purchase_order_id")
			.notNull()
			.references(() => purchaseOrders.id, { onDelete: "cascade" }),

		// Product being ordered — restrict delete (cannot delete product on open PO)
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "restrict" }),

		// How many units were ordered
		orderedQty: integer("ordered_qty").notNull(),

		// How many units have been received so far (incremented on receiving workflow)
		receivedQty: integer("received_qty").notNull().default(0),

		// Cost per unit at time of ordering (in cents) — may differ from product.price
		unitCost: integer("unit_cost").notNull(),

		// orderedQty × unitCost (precomputed for performance)
		totalCost: integer("total_cost").notNull(),

		notes: text("notes"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		poIdIdx: index("po_items_po_id_idx").on(table.purchaseOrderId),
		productIdx: index("po_items_product_idx").on(table.productId),
	})
);
