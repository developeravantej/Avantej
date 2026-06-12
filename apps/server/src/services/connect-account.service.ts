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
import { resolveEffectiveTier, type Tier } from "@avantej-core/types";

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
	if (!org?.subscriptionId) {
		return resolveEffectiveTier(null);
	}
	// Read status alongside tier: a non-live (canceled/unpaid) subscription must
	// NOT keep its tier's discounted fee — resolveEffectiveTier applies the
	// LIVE_SUBSCRIPTION_STATUSES gate and falls back to basic otherwise.
	const [sub] = await controlPanelDb
		.select({ tier: subscriptions.tier, status: subscriptions.status })
		.from(subscriptions)
		.where(eq(subscriptions.id, org.subscriptionId))
		.limit(1);
	return resolveEffectiveTier(sub ?? null);
}

/**
 * Resolve a Connect account for an org WITHOUT a specific country in scope.
 *
 * Phase 4.5: legacy fallback to organizations.stripe_connect_account_id is
 * REMOVED. Callers without a country must accept the "first charges-enabled
 * country" the tenant has onboarded — typically only one in early-stage orgs.
 * For deterministic resolution, callers SHOULD pass a country (use
 * getConnectAccountForOrgCountry).
 *
 * Throws:
 *   NOT_FOUND if the org doesn't exist.
 *   PRECONDITION_FAILED if no country acct exists OR none are charges-enabled.
 */
export async function getConnectAccountForOrg(
	orgId: string,
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
): Promise<ResolvedConnectAccount> {
	const [org] = await controlPanelDb
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	if (!org) {
		throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
	}

	const rows = await controlPanelDb
		.select()
		.from(orgCountryStripeAccounts)
		.where(eq(orgCountryStripeAccounts.organizationId, orgId));

	// Prefer a charges-enabled row; fall through to the first row if none enabled
	// (caller will get a PRECONDITION_FAILED with a clear "not enabled" message).
	const enabled = rows.find((r) => r.stripeAccountId && r.chargesEnabled);
	if (!enabled) {
		if (rows.length === 0) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Tenant has not connected a Stripe account yet",
			});
		}
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Stripe Connect account is not enabled for charges",
		});
	}

	const { tier, appFeeBps } = await resolveTier(orgId, controlPanelDb);
	return {
		acctId: enabled.stripeAccountId!,
		chargesEnabled: enabled.chargesEnabled,
		appFeeBps,
		tier,
		currency: enabled.currency,
		countryCode: enabled.countryCode,
	};
}

/**
 * Phase 4 — resolve a tenant's Connect account for a specific country.
 *
 * Reads org_country_stripe_accounts. No legacy fallback (Phase 4.5).
 *
 * Throws PRECONDITION_FAILED if no row OR charges disabled.
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

	if (!row?.stripeAccountId) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: `No Stripe Connect account onboarded for country=${normalized}`,
		});
	}
	if (!row.chargesEnabled) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: `Stripe Connect account for country=${normalized} is not enabled for charges`,
		});
	}

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
