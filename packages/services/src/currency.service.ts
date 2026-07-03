/**
 * Currency resolution (WS1 — multi-currency correctness).
 *
 * The branch is the source of truth for currency. `branch_details.currency`
 * holds it once set (seeded from the branch's country node); when a branch has
 * no `branch_details` row or an unset currency, we resolve it from the country
 * node name via COUNTRY_CURRENCY. Money rows (commission splits, service prices,
 * …) are stamped with the resolved currency at write time so aggregates can
 * GROUP BY currency without re-deriving.
 *
 * Multi-country tenants (MOVE-shaped MY/TH/SG) previously saw MYR assumed
 * everywhere; this makes each branch's money render in its own currency.
 */

import { eq } from "drizzle-orm";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

/** Fallback currency when a branch's country can't be resolved. */
export const DEFAULT_CURRENCY = "MYR";

/**
 * Country-node name (lowercased) → ISO currency code. Extend as new countries
 * are onboarded. Keep in sync with the CASE map in migration 0097.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
	malaysia: "MYR",
	thailand: "THB",
	singapore: "SGD",
	indonesia: "IDR",
	philippines: "PHP",
	vietnam: "VND",
};

/** Map a country node name to its ISO currency, defaulting to MYR. */
export function currencyForCountryName(
	name: string | null | undefined,
): string {
	if (!name) return DEFAULT_CURRENCY;
	return COUNTRY_CURRENCY[name.trim().toLowerCase()] ?? DEFAULT_CURRENCY;
}

/**
 * Resolve the ISO currency for a branch node.
 *
 * 1. `branch_details.currency` if set (authoritative once seeded).
 * 2. else the branch's country node name → COUNTRY_CURRENCY.
 * 3. else DEFAULT_CURRENCY.
 */
export async function resolveBranchCurrency(
	tenantDb: TenantDb,
	branchNodeId: string,
): Promise<string> {
	const [detail] = await tenantDb
		.select({ currency: branchDetails.currency })
		.from(branchDetails)
		.where(eq(branchDetails.nodeId, branchNodeId))
		.limit(1);
	if (detail?.currency) return detail.currency;

	// Seed path: branch node → its denormalized country ancestor → name.
	const [branch] = await tenantDb
		.select({ countryNodeId: hierarchyNodes.countryNodeId })
		.from(hierarchyNodes)
		.where(eq(hierarchyNodes.id, branchNodeId))
		.limit(1);
	if (!branch?.countryNodeId) return DEFAULT_CURRENCY;

	const [country] = await tenantDb
		.select({ name: hierarchyNodes.name })
		.from(hierarchyNodes)
		.where(eq(hierarchyNodes.id, branch.countryNodeId))
		.limit(1);
	return currencyForCountryName(country?.name);
}
