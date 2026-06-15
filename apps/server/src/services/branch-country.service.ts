/**
 * Branch -> country ISO code resolver (Plan B Phase 4).
 *
 * Walks the tenant hierarchy:
 *   appointment.branch_id (depth 3, type='branch')
 *     -> hierarchy_nodes.country_node_id (denormalized FK, Phase G0)
 *     -> hierarchy_nodes(country).name
 *     -> ISO 3166-1 alpha-2 code
 *
 * If the country name doesn't map to a known ISO code, returns null and the
 * caller falls back to legacy org-level Connect account.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";

type TenantDb = NeonDatabase<typeof tenantSchema>;

// Best-effort country-name -> ISO mapping for SEA + adjacent markets.
// Add entries as new countries onboard. Names are matched case-insensitively
// against the hierarchy node's `name` field.
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
	malaysia: "MY",
	singapore: "SG",
	thailand: "TH",
	indonesia: "ID",
	philippines: "PH",
	vietnam: "VN",
	"hong kong": "HK",
	australia: "AU",
	"new zealand": "NZ",
	"united states": "US",
	"united kingdom": "GB",
	japan: "JP",
	china: "CN",
};

export function nameToCountryCode(
	name: string | null | undefined,
): string | null {
	if (!name) return null;
	const k = name.trim().toLowerCase();
	// Accept either full name or already-ISO code.
	if (k.length === 2) return k.toUpperCase();
	return COUNTRY_NAME_TO_ISO[k] ?? null;
}

/**
 * Resolve the ISO country code for a branch by walking the hierarchy
 * countryNodeId pointer (denormalized on each branch row).
 *
 * Returns null if:
 *   - branch not found
 *   - branch has no countryNodeId (legacy hierarchy)
 *   - country node name doesn't match a known ISO mapping
 */
export async function resolveBranchCountryCode(
	branchId: string,
	tenantDb: TenantDb,
): Promise<string | null> {
	const [branch] = await tenantDb
		.select({ countryNodeId: hierarchyNodes.countryNodeId })
		.from(hierarchyNodes)
		.where(eq(hierarchyNodes.id, branchId))
		.limit(1);
	if (!branch?.countryNodeId) return null;

	const [country] = await tenantDb
		.select({ name: hierarchyNodes.name })
		.from(hierarchyNodes)
		.where(eq(hierarchyNodes.id, branch.countryNodeId))
		.limit(1);
	return nameToCountryCode(country?.name);
}
