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

import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";

export type ResolvedConnectAccount = {
	acctId: string;
	chargesEnabled: boolean;
	/** Basis points (e.g. 200 = 2%) to compute application_fee_amount. */
	appFeeBps: number;
	tier: Tier | null;
};

/**
 * Resolve the Stripe Connect account + platform fee for an org.
 *
 * Throws ORPCError if:
 *   - org missing
 *   - no Stripe Connect account linked (PRECONDITION_FAILED)
 *   - charges disabled on Stripe side (PRECONDITION_FAILED)
 */
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

	// App fee % comes from the tenant's SaaS subscription tier.
	let tier: Tier | null = null;
	if (org.subscriptionId) {
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

	return {
		acctId: org.stripeConnectAccountId,
		chargesEnabled: org.chargesEnabled,
		appFeeBps,
		tier,
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
