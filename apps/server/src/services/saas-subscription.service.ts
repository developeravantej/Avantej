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
	// Delete the empty-string fallback entry to avoid false positives when an env var is unset.
	delete map[""];
	return map[priceId] ?? "basic";
}

function unixToDate(ts: number | null | undefined): Date | null {
	return typeof ts === "number" ? new Date(ts * 1000) : null;
}

function clampInt32(n: number): number {
	return Number.isFinite(n) && n <= INT32_MAX ? n : INT32_MAX;
}

export async function upsertSubscriptionFromStripe(
	sub: Stripe.Subscription,
): Promise<void> {
	const priceId = sub.items.data[0]?.price.id;
	if (!priceId) {
		throw new Error(`Subscription ${sub.id} has no price item`);
	}
	const tier = computeTierFromPriceId(priceId);
	const limits = TIER_LIMITS[tier];
	const currency = (sub.items.data[0]?.price.currency ?? "usd").toLowerCase();
	const customerId =
		typeof sub.customer === "string" ? sub.customer : sub.customer.id;

	await controlPanelDb
		.insert(subscriptions)
		.values({
			stripeSubscriptionId: sub.id,
			stripeCustomerId: customerId,
			stripePriceId: priceId,
			tier,
			organizationCountLimit: clampInt32(limits.organizations),
			applicationFeeBps: limits.appFeeBps,
			currency,
			status: sub.status,
			currentPeriodStart: unixToDate(sub.current_period_start),
			currentPeriodEnd: unixToDate(sub.current_period_end),
			trialEndsAt: unixToDate(sub.trial_end),
			cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
			canceledAt: unixToDate(sub.canceled_at),
		})
		.onConflictDoUpdate({
			target: subscriptions.stripeSubscriptionId,
			set: {
				stripePriceId: priceId,
				tier,
				organizationCountLimit: clampInt32(limits.organizations),
				applicationFeeBps: limits.appFeeBps,
				currency,
				status: sub.status,
				currentPeriodStart: unixToDate(sub.current_period_start),
				currentPeriodEnd: unixToDate(sub.current_period_end),
				trialEndsAt: unixToDate(sub.trial_end),
				cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
				canceledAt: unixToDate(sub.canceled_at),
				updatedAt: new Date(),
			},
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
