/**
 * Product Prices Schema (Agent 2.2 — Phase 2 Wave 3b — J2 pricing leg)
 *
 * Per-branch + per-customer-type price overrides for products. Same lookup
 * semantics as service_prices — see that file for the resolution chain.
 */

import {
	pgTable,
	uuid,
	integer,
	text,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { hierarchyNodes } from "./hierarchy";

export const productPrices = pgTable(
	"product_prices",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		// NULL branchId = org-wide override
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "cascade",
		}),
		// NULL customerType = applies to all customer types
		customerType: text("customer_type"),
		priceCents: integer("price_cents").notNull(),
		effectiveFrom: timestamp("effective_from", { withTimezone: true })
			.defaultNow()
			.notNull(),
		// NULL effectiveUntil = open-ended
		effectiveUntil: timestamp("effective_until", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => ({
		lookupIdx: index("product_prices_lookup_idx").on(
			t.productId,
			t.branchId,
			t.customerType,
		),
	}),
);
