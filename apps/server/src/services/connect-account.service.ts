/**
 * Connect Account resolution helper (Plan B Phase 2).
 *
 * Single read path for the tenant's Stripe Connect account ID. Callers go
 * through this so Phase 4 (per-country branch Stripe accounts) can swap the
 * lookup implementation without touching charge handlers, webhooks, or UI.
 *
 * Phase 2: reads organizations.stripe_connect_account_id (org-level, MY).
 * Phase 4 (pending ADR): looks up via branch -> country_node_id -> per-country
 *   stripe account. Function shape stays the same.
 */

import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";

export type ResolvedConnectAccount = {
	acctId: string;
	chargesEnabled: boolean;
	/** Basis points (e.g. 200 = 2%) to compute application_fee_amount. */
	appFeeBps: number;
	tier: Tier | null;
	/** ISO 4217 (MYR | SGD | THB ...). Falls back to MYR for legacy org-level acct. */
	currency: string;
	/** ISO 3166-1 alpha-2 (MY | SG | TH ...). null if from legacy org-level acct. */
	countryCode: string | null;
};

/**
 * Resolve the Stripe Connect account + platform fee for an org.
 *
 * Throws ORPCError if:
 *   - org missing
 *   - no Stripe Connect account linked (PRECONDITION_FAILED)
 *   - charges disabled on Stripe side (PRECONDITION_FAILED)
 */
async function resolveTier(
	orgId: string,
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
): Promise<{ tier: Tier | null; appFeeBps: number }> {
	const [org] = await controlPanelDb
		.select({ subscriptionId: organizations.subscriptionId })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	let tier: Tier | null = null;
	if (org?.subscriptionId) {
		const [sub] = await controlPanelDb
			.select({ tier: subscriptions.tier })
			.from(subscriptions)
			.where(eq(subscriptions.id, org.subscriptionId))
			.limit(1);
		if (sub?.tier && (sub.tier === "basic" || sub.tier === "professional" || sub.tier === "enterprise")) {
			tier = sub.tier;
		}
	}
	const appFeeBps = tier ? TIER_LIMITS[tier].appFeeBps : TIER_LIMITS.basic.appFeeBps;
	return { tier, appFeeBps };
}

export async function getConnectAccountForOrg(
	orgId: string,
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
): Promise<ResolvedConnectAccount> {
	const [org] = await controlPanelDb
		.select()
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	if (!org) {
		throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
	}
	if (!org.stripeConnectAccountId) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Tenant has not connected a Stripe account yet",
		});
	}
	if (!org.chargesEnabled) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Stripe Connect account is not enabled for charges",
		});
	}

	const { tier, appFeeBps } = await resolveTier(orgId, controlPanelDb);

	return {
		acctId: org.stripeConnectAccountId,
		chargesEnabled: org.chargesEnabled,
		appFeeBps,
		tier,
		currency: "MYR", // Legacy org-level acct assumed MY.
		countryCode: null,
	};
}

/**
 * Phase 4 — resolve a tenant's Connect account for a specific country.
 *
 * Reads org_country_stripe_accounts. If no row exists for the requested
 * country, falls back to the legacy org-level account from organizations
 * (which is MY by historical default) — kept for the 1-release deprecation
 * window while callers migrate.
 *
 * Throws PRECONDITION_FAILED if no usable account is found OR if the
 * resolved account has charges disabled.
 */
export async function getConnectAccountForOrgCountry(
	orgId: string,
	countryCode: string,
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
): Promise<ResolvedConnectAccount> {
	const normalized = countryCode.toUpperCase();
	const [row] = await controlPanelDb
		.select()
		.from(orgCountryStripeAccounts)
		.where(
			and(
				eq(orgCountryStripeAccounts.organizationId, orgId),
				eq(orgCountryStripeAccounts.countryCode, normalized),
			),
		)
		.limit(1);

	if (row?.stripeAccountId && row.chargesEnabled) {
		const { tier, appFeeBps } = await resolveTier(orgId, controlPanelDb);
		return {
			acctId: row.stripeAccountId,
			chargesEnabled: row.chargesEnabled,
			appFeeBps,
			tier,
			currency: row.currency,
			countryCode: row.countryCode,
		};
	}

	// Fallback to legacy org-level account (Phase 1-3). Acceptable as long as
	// the tenant only operates in one country (or hasn't onboarded per-country
	// accounts yet). Callers migrating to multi-country must drop this fallback.
	const legacy = await getConnectAccountForOrg(orgId, controlPanelDb);
	console.warn(
		`[connect] no country acct for org=${orgId} country=${normalized} — falling back to legacy org-level acct=${legacy.acctId}`,
	);
	return legacy;
}

/**
 * Compute application fee from gross amount + tier basis-points.
 * Rounds DOWN to integer minor units (cents) — never overcharge fee.
 */
export function computeApplicationFee(
	grossAmountMinor: number,
	appFeeBps: number,
): number {
	return Math.floor((grossAmountMinor * appFeeBps) / 10_000);
}
