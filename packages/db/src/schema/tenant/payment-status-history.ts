/**
 * Payment Status History
 *
 * Append-only audit log of every status transition on a payments row.
 * Written in the same transaction as the status mutation via
 * `appendPaymentStatusHistory()` in services.
 */

import { pgTable, uuid, index } from "drizzle-orm/pg-core";
import { payments } from "./payments";
import { statusHistoryColumns } from "./_status-history-columns";

export const paymentStatusHistory = pgTable(
	"payment_status_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		paymentId: uuid("payment_id")
			.notNull()
			.references(() => payments.id, { onDelete: "cascade" }),
		...statusHistoryColumns,
	},
	(t) => ({
		entityIdx: index("payment_status_hist_entity_idx").on(
			t.paymentId,
			t.changedAt,
		),
	}),
);
