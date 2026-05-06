/**
 * Pricing Service (Agent 2.2 — Phase 2 Wave 3b — J2 pricing leg)
 *
 * Resolves the effective price for a service or product given a branch and
 * (optionally) a customer type, using a most-specific-first lookup chain:
 *
 *   1. (entity_id, branch_id, customer_type)
 *   2. (entity_id, branch_id, NULL)
 *   3. (entity_id, NULL, customer_type)        — org-wide for that customer type
 *   4. (entity_id, NULL, NULL)                 — org-wide override
 *   5. fall back to services.price / products.price
 *
 * A row is only considered "current" when:
 *   effective_from <= at AND (effective_until IS NULL OR effective_until > at)
 *
 * Caching: deferred. The plan called for an LRU but no project-wide cache
 * utility exists, and creating one is out of scope for this agent. The lookup
 * is index-backed (`service_prices_lookup_idx` / `product_prices_lookup_idx`)
 * so a cold lookup is O(log n) on a small list.
 */

import { and, desc, eq, isNull, lte, or, gt } from "drizzle-orm";
import type { servicePrices as servicePricesTable } from "@avantej-core/db/schema/tenant/service-prices";
import type { productPrices as productPricesTable } from "@avantej-core/db/schema/tenant/product-prices";

// Local re-import (we intentionally keep types decoupled from the table import order).
import { servicePrices } from "@avantej-core/db/schema/tenant/service-prices";
import { productPrices } from "@avantej-core/db/schema/tenant/product-prices";
import { services } from "@avantej-core/db/schema/tenant/services";
import { products } from "@avantej-core/db/schema/tenant/products";

// Loose handle type so this works against either the connection or a transaction.
// Mirrors the pattern Agent 2.7 used for status-history.helper.ts.
// biome-ignore lint/suspicious/noExplicitAny: tenantDb generic varies between callers (pool / tx)
type DbHandle = any;

type PriceRow = {
	priceCents: number;
	branchId: string | null;
	customerType: string | null;
};

/**
 * Resolve a service's effective price (in cents) for a branch + customer type.
 * Returns `null` when no override matches AND the underlying service has no
 * fallback `price`. Callers that always need a number should treat null as "no
 * price configured" and surface that as a validation error.
 */
export async function resolveServicePrice(
	tenantDb: DbHandle,
	serviceId: string,
	branchId: string | null,
	customerType: string | null = null,
	at: Date = new Date(),
): Promise<number | null> {
	const candidates = await tenantDb
		.select({
			priceCents: servicePrices.priceCents,
			branchId: servicePrices.branchId,
			customerType: servicePrices.customerType,
		})
		.from(servicePrices)
		.where(
			and(
				eq(servicePrices.serviceId, serviceId),
				lte(servicePrices.effectiveFrom, at),
				or(isNull(servicePrices.effectiveUntil), gt(servicePrices.effectiveUntil, at)),
			),
		)
		.orderBy(desc(servicePrices.effectiveFrom));

	const winner = pickMostSpecific(candidates as PriceRow[], branchId, customerType);
	if (winner !== null) return winner;

	// Fallback to services.price
	const [svc] = await tenantDb
		.select({ price: services.price })
		.from(services)
		.where(eq(services.id, serviceId))
		.limit(1);
	return svc?.price ?? null;
}

/**
 * Resolve a product's effective price (in cents) — same chain as services.
 * Always returns a number because `products.price` is NOT NULL.
 */
export async function resolveProductPrice(
	tenantDb: DbHandle,
	productId: string,
	branchId: string | null,
	customerType: string | null = null,
	at: Date = new Date(),
): Promise<number> {
	const candidates = await tenantDb
		.select({
			priceCents: productPrices.priceCents,
			branchId: productPrices.branchId,
			customerType: productPrices.customerType,
		})
		.from(productPrices)
		.where(
			and(
				eq(productPrices.productId, productId),
				lte(productPrices.effectiveFrom, at),
				or(isNull(productPrices.effectiveUntil), gt(productPrices.effectiveUntil, at)),
			),
		)
		.orderBy(desc(productPrices.effectiveFrom));

	const winner = pickMostSpecific(candidates as PriceRow[], branchId, customerType);
	if (winner !== null) return winner;

	const [prod] = await tenantDb
		.select({ price: products.price })
		.from(products)
		.where(eq(products.id, productId))
		.limit(1);
	if (!prod) throw new Error(`Product not found: ${productId}`);
	return prod.price;
}

/**
 * Specificity ranking: higher = more specific. We pick the highest-scoring row.
 * Ties (same specificity, multiple matching rows) are broken by recency
 * (`ORDER BY effective_from DESC` in the query).
 *
 *   branch + customerType match     → 4
 *   branch match, customerType NULL → 3
 *   branch NULL, customerType match → 2
 *   branch NULL + customerType NULL → 1
 *
 * Rows that don't match the branch/customerType context at all (e.g. a row
 * scoped to a different branch) are filtered out.
 */
function pickMostSpecific(
	rows: PriceRow[],
	branchId: string | null,
	customerType: string | null,
): number | null {
	let bestScore = 0;
	let bestPrice: number | null = null;
	for (const row of rows) {
		// Filter: branch must either match or be NULL (org-wide). A row with a
		// different branch is not applicable.
		if (row.branchId !== null && row.branchId !== branchId) continue;
		// Same for customer type.
		if (row.customerType !== null && row.customerType !== customerType) continue;

		const branchHit = row.branchId !== null && row.branchId === branchId;
		const ctHit = row.customerType !== null && row.customerType === customerType;
		let score: number;
		if (branchHit && ctHit) score = 4;
		else if (branchHit) score = 3;
		else if (ctHit) score = 2;
		else score = 1;

		if (score > bestScore) {
			bestScore = score;
			bestPrice = row.priceCents;
		}
		// Equal score: query is ordered by effective_from DESC, so the first
		// hit at this score is the most recent — keep it (don't overwrite).
	}
	return bestPrice;
}

/**
 * List all currently-active price overrides for a service, sorted most-specific
 * first. Used by the router/UI to display configured branch overrides.
 */
export async function listServicePriceOverrides(
	tenantDb: DbHandle,
	serviceId: string,
	at: Date = new Date(),
): Promise<
	Array<{
		id: string;
		branchId: string | null;
		customerType: string | null;
		priceCents: number;
		effectiveFrom: Date;
		effectiveUntil: Date | null;
	}>
> {
	const rows = await tenantDb
		.select()
		.from(servicePrices)
		.where(
			and(
				eq(servicePrices.serviceId, serviceId),
				lte(servicePrices.effectiveFrom, at),
				or(isNull(servicePrices.effectiveUntil), gt(servicePrices.effectiveUntil, at)),
			),
		)
		.orderBy(desc(servicePrices.effectiveFrom));
	return rows.map((r: typeof servicePricesTable.$inferSelect) => ({
		id: r.id,
		branchId: r.branchId,
		customerType: r.customerType,
		priceCents: r.priceCents,
		effectiveFrom: r.effectiveFrom,
		effectiveUntil: r.effectiveUntil,
	}));
}

/** List active product price overrides — mirror of `listServicePriceOverrides`. */
export async function listProductPriceOverrides(
	tenantDb: DbHandle,
	productId: string,
	at: Date = new Date(),
): Promise<
	Array<{
		id: string;
		branchId: string | null;
		customerType: string | null;
		priceCents: number;
		effectiveFrom: Date;
		effectiveUntil: Date | null;
	}>
> {
	const rows = await tenantDb
		.select()
		.from(productPrices)
		.where(
			and(
				eq(productPrices.productId, productId),
				lte(productPrices.effectiveFrom, at),
				or(isNull(productPrices.effectiveUntil), gt(productPrices.effectiveUntil, at)),
			),
		)
		.orderBy(desc(productPrices.effectiveFrom));
	return rows.map((r: typeof productPricesTable.$inferSelect) => ({
		id: r.id,
		branchId: r.branchId,
		customerType: r.customerType,
		priceCents: r.priceCents,
		effectiveFrom: r.effectiveFrom,
		effectiveUntil: r.effectiveUntil,
	}));
}

export type SetServicePriceParams = {
	serviceId: string;
	branchId: string | null;
	customerType?: string | null;
	priceCents: number;
	effectiveFrom?: Date;
	effectiveUntil?: Date | null;
};

/** Insert a new service price override row. */
export async function setServicePrice(
	tenantDb: DbHandle,
	params: SetServicePriceParams,
): Promise<{ id: string }> {
	const [row] = await tenantDb
		.insert(servicePrices)
		.values({
			serviceId: params.serviceId,
			branchId: params.branchId,
			customerType: params.customerType ?? null,
			priceCents: params.priceCents,
			...(params.effectiveFrom ? { effectiveFrom: params.effectiveFrom } : {}),
			...(params.effectiveUntil !== undefined ? { effectiveUntil: params.effectiveUntil } : {}),
		})
		.returning({ id: servicePrices.id });
	return row;
}

export type SetProductPriceParams = {
	productId: string;
	branchId: string | null;
	customerType?: string | null;
	priceCents: number;
	effectiveFrom?: Date;
	effectiveUntil?: Date | null;
};

/** Insert a new product price override row. */
export async function setProductPrice(
	tenantDb: DbHandle,
	params: SetProductPriceParams,
): Promise<{ id: string }> {
	const [row] = await tenantDb
		.insert(productPrices)
		.values({
			productId: params.productId,
			branchId: params.branchId,
			customerType: params.customerType ?? null,
			priceCents: params.priceCents,
			...(params.effectiveFrom ? { effectiveFrom: params.effectiveFrom } : {}),
			...(params.effectiveUntil !== undefined ? { effectiveUntil: params.effectiveUntil } : {}),
		})
		.returning({ id: productPrices.id });
	return row;
}
