// packages/services/src/tax.service.ts
//
// Tax rate resolution for sales_order_items / payment_items snapshots.
//
// WS3 (MOVE parity) made this per-branch/per-country aware. Resolution
// precedence for a branch at a given moment:
//   1. branch_details.branch_tax_rate_id — an explicit per-branch override,
//      used only if that rate is still active.
//   2. tax_rates.country == the branch's country key (active + effective at
//      `at`), preferring isDefault — per-country scoping.
//   3. the org-wide active rate at `at`, preferring isDefault — the ORIGINAL
//      behavior, kept as the FINAL fallback so no branch can lose its rate
//      (preserves the NO_TAX_RATE safety net that unblocked MOVE).
//
// branchId null (org-wide caller / no branch context) skips steps 1–2 and
// resolves exactly as before. No cache: lookups are infrequent (one per
// order/payment).

import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { resolveBranchCountryKey } from "./currency.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type ResolvedTaxRate = {
	id: string;
	rateInBasisPoints: number;
};

/** Active-and-effective-at-`at` predicate shared by every lookup step. */
function activeAt(at: Date) {
	return and(
		eq(taxRates.isActive, true),
		lte(taxRates.effectiveFrom, at),
		or(isNull(taxRates.effectiveUntil), gt(taxRates.effectiveUntil, at)),
	);
}

/**
 * Resolve the tax rate that should apply to a sale at a given moment.
 *
 * @param tenantDb active tenant connection or transaction
 * @param branchId branch node the sale belongs to; drives per-branch/country
 *                 resolution. null → org-wide resolution (original behavior).
 * @param at       order/payment date (defaults to now)
 * @returns the rate row (id + basis points) or null when nothing matches
 */
export async function resolveTaxRate(
	tenantDb: TenantDb,
	branchId: string | null,
	at: Date = new Date(),
): Promise<ResolvedTaxRate | null> {
	// --- 1. Explicit per-branch override -----------------------------------
	if (branchId) {
		const [detail] = await tenantDb
			.select({ branchTaxRateId: branchDetails.branchTaxRateId })
			.from(branchDetails)
			.where(eq(branchDetails.nodeId, branchId))
			.limit(1);
		if (detail?.branchTaxRateId) {
			const [override] = await tenantDb
				.select({
					id: taxRates.id,
					rateInBasisPoints: taxRates.rateInBasisPoints,
				})
				.from(taxRates)
				.where(and(eq(taxRates.id, detail.branchTaxRateId), activeAt(at)))
				.limit(1);
			// Only honor the override if it's still active/effective; otherwise
			// fall through so the branch is never left rate-less.
			if (override) return override;
		}
	}

	// --- 2. Per-country rate -----------------------------------------------
	if (branchId) {
		const countryKey = await resolveBranchCountryKey(tenantDb, branchId);
		if (countryKey) {
			const [countryRate] = await tenantDb
				.select({
					id: taxRates.id,
					rateInBasisPoints: taxRates.rateInBasisPoints,
				})
				.from(taxRates)
				.where(and(eq(taxRates.country, countryKey), activeAt(at)))
				.orderBy(
					desc(taxRates.isDefault),
					desc(taxRates.effectiveFrom),
					asc(taxRates.id),
				)
				.limit(1);
			if (countryRate) return countryRate;
		}
	}

	// --- 3. Org-wide fallback (ORIGINAL behavior — never removed) -----------
	const [row] = await tenantDb
		.select({
			id: taxRates.id,
			rateInBasisPoints: taxRates.rateInBasisPoints,
		})
		.from(taxRates)
		.where(activeAt(at))
		// Prefer the org default; tie-break by most-recent effective_from so a
		// freshly-introduced rate wins over an older still-active one.
		.orderBy(
			desc(taxRates.isDefault),
			desc(taxRates.effectiveFrom),
			asc(taxRates.id),
		)
		.limit(1);

	return row ?? null;
}
