/**
 * SaaS Subscription Lifecycle (control-panel side).
 *
 * Reconciles the local `subscriptions` row with Stripe's Subscription object.
 * Called from the platform webhook handler (Task 9) and the reconciler (Plan D).
 *
 * Per ADR-0002 (tier app-fee bps) and ADR-0009 (7-day past-due grace).
 *
 * Env vars:
 * - STRIPE_PRICE_BASIC          basic tier price id (set after running stripe:seed)
 * - STRIPE_PRICE_PROFESSIONAL   professional tier price id
 * - STRIPE_PRICE_ENTERPRISE     enterprise tier price id
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { controlPanelDb } from "@/lib/db";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const INT32_MAX = 2_147_483_647;

function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, string | undefined>;
		};
		const v = env[key];
		if (v !== undefined) return v;
	} catch {
		// Not in Cloudflare Workers runtime.
	}
	const globalEnv = (globalThis as { env?: Record<string, string | undefined> }).env;
	if (globalEnv?.[key] !== undefined) return globalEnv[key];
	return process.env[key];
}

export function computeTierFromPriceId(priceId: string): Tier {
	const map: Record<string, Tier> = {
		[getEnvVar("STRIPE_PRICE_BASIC") ?? ""]: "basic",
		[getEnvVar("STRIPE_PRICE_PROFESSIONAL") ?? ""]: "professional",
		[getEnvVar("STRIPE_PRICE_ENTERPRISE") ?? ""]: "enterprise",
	};
	// If any STRIPE_PRICE_* env var is unset, the computed map key is "". Delete that
	// entry so an unknown priceId doesn't accidentally match it (TS computed keys
	// collapse duplicate "" keys with last-wins assignment).
	delete map[""];
	return map[priceId] ?? "basic";
}

function unixToDate(ts: number | null | undefined): Date | null {
	return typeof ts === "number" ? new Date(ts * 1000) : null;
}

// TIER_LIMITS.enterprise.organizations = MAX_SAFE_INTEGER (2^53 - 1) > pg int32 max (2^31 - 1). Clamp before insert.
function clampInt32(n: number): number {
	return Number.isFinite(n) && n <= INT32_MAX ? n : INT32_MAX;
}

export async function upsertSubscriptionFromStripe(
	sub: Stripe.Subscription,
): Promise<void> {
	const item = sub.items.data[0];
	if (!item) {
		throw new Error(`Subscription ${sub.id} has no item`);
	}
	const priceId = item.price.id;
	if (!priceId) {
		throw new Error(`Subscription ${sub.id} item has no price id`);
	}

	const tier = computeTierFromPriceId(priceId);
	const limits = TIER_LIMITS[tier];
	const currency = (item.price.currency ?? "usd").toLowerCase();
	const customerId =
		typeof sub.customer === "string" ? sub.customer : sub.customer.id;

	// Per Stripe API 2025-10-29.clover: period fields live on SubscriptionItem.
	const periodStart = unixToDate(item.current_period_start);
	const periodEnd = unixToDate(item.current_period_end);

	const common = {
		stripePriceId: priceId,
		tier,
		organizationCountLimit: clampInt32(limits.organizations),
		applicationFeeBps: limits.appFeeBps,
		currency,
		status: sub.status,
		currentPeriodStart: periodStart,
		currentPeriodEnd: periodEnd,
		trialEndsAt: unixToDate(sub.trial_end),
		cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
		canceledAt: unixToDate(sub.canceled_at),
	};

	await controlPanelDb
		.insert(subscriptions)
		.values({
			stripeSubscriptionId: sub.id,
			stripeCustomerId: customerId,
			...common,
		})
		.onConflictDoUpdate({
			target: subscriptions.stripeSubscriptionId,
			set: { ...common, updatedAt: new Date() },
		});
}

export async function markPastDue(stripeSubscriptionId: string): Promise<void> {
	const now = new Date();
	const updated = await controlPanelDb
		.update(subscriptions)
		.set({
			status: "past_due",
			pastDueAt: now,
			gracePeriodEndsAt: new Date(now.getTime() + GRACE_PERIOD_MS),
			updatedAt: now,
		})
		.where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
		.returning({ id: subscriptions.id });
	if (updated.length === 0) {
		throw new Error(
			`markPastDue: no row for stripeSubscriptionId=${stripeSubscriptionId}`,
		);
	}
}

export async function markActive(stripeSubscriptionId: string): Promise<void> {
	const updated = await controlPanelDb
		.update(subscriptions)
		.set({
			status: "active",
			pastDueAt: null,
			gracePeriodEndsAt: null,
			updatedAt: new Date(),
		})
		.where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
		.returning({ id: subscriptions.id });
	if (updated.length === 0) {
		throw new Error(
			`markActive: no row for stripeSubscriptionId=${stripeSubscriptionId}`,
		);
	}
}
