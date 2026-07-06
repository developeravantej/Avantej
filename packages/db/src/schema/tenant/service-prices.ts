/**
 * Service Prices Schema (Agent 2.2 — Phase 2 Wave 3b — J2 pricing leg)
 *
 * Per-branch + per-customer-type price overrides for services.
 *
 * Lookup chain (most specific first):
 *   1. (service_id, branch_id, customer_type)  — branch + customer-type specific
 *   2. (service_id, branch_id, NULL)           — branch-wide
 *   3. (service_id, NULL, customer_type)       — org-wide for a customer type
 *   4. (service_id, NULL, NULL)                — org-wide
 *   5. fall back to services.price             — service default
 *
 * Validity is bounded by [effective_from, effective_until). NULL effective_until
 * means open-ended.
 */

import {
	pgTable,
	uuid,
	integer,
	text,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { services } from "./services";
import { hierarchyNodes } from "./hierarchy";

export const servicePrices = pgTable(
	"service_prices",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		serviceId: uuid("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "cascade" }),
		// NULL branchId = org-wide override
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "cascade",
		}),
		// NULL customerType = applies to all customer types
		customerType: text("customer_type"),
		priceCents: integer("price_cents").notNull(),
		// WS1 (multi-currency): ISO currency for this price, stamped from the
		// branch (or org default for NULL branchId) at write time. Nullable
		// during rollout; readers fall back to the branch currency.
		currency: text("currency"),
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
		lookupIdx: index("service_prices_lookup_idx").on(
			t.serviceId,
			t.branchId,
			t.customerType,
		),
	}),
);
