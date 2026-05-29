import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { products } from "./products";

/**
 * stock_movements — append-only audit trail of every product-stock mutation
 * (F-INV-06). Each row records a signed `delta`, the resulting `quantityAfter`
 * (when known), a human reason, and the source document that caused it.
 */
export const stockMovements = pgTable(
	"stock_movements",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		branchId: uuid("branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
		delta: integer("delta").notNull(),
		quantityAfter: integer("quantity_after"),
		reason: text("reason").notNull(),
		sourceType: text("source_type"),
		sourceId: uuid("source_id"),
		actorUserId: text("actor_user_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		productBranchIdx: index("stock_movements_product_branch_idx").on(
			table.productId,
			table.branchId,
		),
		sourceIdx: index("stock_movements_source_idx").on(table.sourceType, table.sourceId),
	}),
);
