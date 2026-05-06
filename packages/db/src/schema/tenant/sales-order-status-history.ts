/**
 * Sales Order Status History
 *
 * Append-only audit log of every status transition on a sales_orders row.
 * Written in the same transaction as the status mutation via
 * `appendSalesOrderStatusHistory()` in services.
 */

import { pgTable, uuid, index } from "drizzle-orm/pg-core";
import { salesOrders } from "./sales-orders";
import { statusHistoryColumns } from "./_status-history-columns";

export const salesOrderStatusHistory = pgTable(
	"sales_order_status_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		salesOrderId: uuid("sales_order_id")
			.notNull()
			.references(() => salesOrders.id, { onDelete: "cascade" }),
		...statusHistoryColumns,
	},
	(t) => ({
		entityIdx: index("sales_order_status_hist_entity_idx").on(
			t.salesOrderId,
			t.changedAt,
		),
	}),
);
