/**
 * Tenant Refund Items Schema (Agent 2.8 — Phase 2 Wave 3d — J5)
 *
 * Per-line refund records supporting partial-package refunds. Each row
 * records either a sales_order_item refund or a package_instance refund
 * (exclusive — enforced via num_nonnulls CHECK).
 *
 * `creditsRefunded` is null when refunding by amount only; populated when
 * refunding specific session credits on a package instance.
 */

import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { packageInstances } from "./package-instances";
import { refunds } from "./refunds";
import { salesOrderItems } from "./sales-order-items";

export const refundItems = pgTable(
	"refund_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		refundId: uuid("refund_id")
			.notNull()
			.references(() => refunds.id, { onDelete: "cascade" }),
		salesOrderItemId: uuid("sales_order_item_id").references(
			() => salesOrderItems.id,
			{ onDelete: "set null" },
		),
		packageInstanceId: uuid("package_instance_id").references(
			() => packageInstances.id,
			{ onDelete: "set null" },
		),
		creditsRefunded: integer("credits_refunded"), // null when refunding by amount, not credits
		amountCents: integer("amount_cents").notNull(),
	},
	(t) => ({
		refundIdx: index("refund_items_refund_idx").on(t.refundId),
		packageIdx: index("refund_items_package_idx").on(t.packageInstanceId),
		oneSourceCheck: check(
			"refund_items_one_source_check",
			sql`num_nonnulls(${t.salesOrderItemId}, ${t.packageInstanceId}) = 1`,
		),
	}),
);
