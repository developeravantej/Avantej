// packages/services/src/tax.service.ts
//
// Agent 2.3 — Phase 2 Wave 3b — Journey J2
//
// Tax rate resolution for sales_order_items / payment_items snapshots.
//
// The current `tax_rates` table is org-wide (no branch_id column). This
// resolver still accepts a `branchId` parameter for forward-compatibility:
// when per-branch tax rates land, the lookup chain can be extended without
// changing call sites. Today, branchId is accepted but unused — the resolver
// always falls through to the org-wide active rate at the given timestamp.
//
// Lookup chain (current):
//   1. tax_rates where isActive=true AND effective_from <= at AND
//      (effective_until > at OR effective_until IS NULL), preferring isDefault.
//   2. null if none.
//
// No cache: matches Agent 2.2's reasoning — the cache utility doesn't exist,
// and tax rate lookups are infrequent (one resolve per order/payment).

import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type ResolvedTaxRate = {
	id: string;
	rateInBasisPoints: number;
};

/**
 * Resolve the tax rate that should apply to a sale at a given moment.
 *
 * @param tenantDb  active tenant connection or transaction
 * @param branchId  reserved for future per-branch tax rates; currently unused
 * @param at        order/payment date (defaults to now)
 * @returns the rate row (id + basis points) or null when nothing matches
 */
export async function resolveTaxRate(
	tenantDb: TenantDb,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_branchId: string | null,
	at: Date = new Date(),
): Promise<ResolvedTaxRate | null> {
	const row = await tenantDb
		.select({
			id: taxRates.id,
			rateInBasisPoints: taxRates.rateInBasisPoints,
		})
		.from(taxRates)
		.where(
			and(
				eq(taxRates.isActive, true),
				lte(taxRates.effectiveFrom, at),
				or(isNull(taxRates.effectiveUntil), gt(taxRates.effectiveUntil, at)),
			),
		)
		// Prefer the org default; tie-break by most-recent effective_from so a
		// freshly-introduced rate wins over an older still-active one.
		.orderBy(
			desc(taxRates.isDefault),
			desc(taxRates.effectiveFrom),
			asc(taxRates.id),
		)
		.limit(1);

	return row[0] ?? null;
}
