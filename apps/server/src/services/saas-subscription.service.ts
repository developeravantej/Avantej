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
import { eq, and, lt } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { controlPanelDb as singletonDb } from "@/lib/db";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";

type CpDb = NeonDatabase<Record<string, unknown>>;
function resolveDb(db?: CpDb): CpDb {
	return db ?? (singletonDb as unknown as CpDb);
}

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
	const tier = map[priceId];
	if (!tier) {
		console.warn(
			`[saas-subscription] computeTierFromPriceId: unknown priceId=${priceId} — falling back to 'basic'. Check STRIPE_PRICE_* env vars.`,
		);
		return "basic";
	}
	return tier;
}

function unixToDate(ts: number | null | undefined): Date | null {
	return typeof ts === "number" ? new Date(ts * 1000) : null;
}

// TIER_LIMITS.enterprise.organizations = MAX_SAFE_INTEGER (2^53 - 1) > pg int32 max (2^31 - 1). Clamp before insert.
function clampInt32(n: number): number {
	return Number.isFinite(n) && n <= INT32_MAX ? n : INT32_MAX;
}

/**
 * Maps a Stripe subscription status to the organizations.paymentStatus value.
 *
 * organizations.paymentStatus controls middleware lockout (orpc-tenant.middleware.ts):
 *   - "suspended" / "cancelled" → full 403 block
 *   - "past_due" → read-only (SAAS_PAST_DUE_READONLY on write procedures)
 *   - "active" → full access
 *
 * Stripe status → paymentStatus mapping (per F-SAAS-1 spec):
 *   active, trialing          → active
 *   past_due, unpaid          → past_due
 *   canceled                  → cancelled
 *   incomplete, incomplete_expired → suspended
 */
function stripeStatusToPaymentStatus(stripeStatus: string): string {
	switch (stripeStatus) {
		case "active":
		case "trialing":
			return "active";
		case "past_due":
		case "unpaid":
			return "past_due";
		case "canceled":
			return "cancelled";
		case "incomplete":
		case "incomplete_expired":
			return "suspended";
		default:
			// Unknown Stripe statuses are treated as suspended to fail-safe.
			console.warn(
				`[saas-subscription] stripeStatusToPaymentStatus: unknown status=${stripeStatus} — defaulting to 'suspended'`,
			);
			return "suspended";
	}
}

export async function upsertSubscriptionFromStripe(
	sub: Stripe.Subscription,
	db?: CpDb,
): Promise<void> {
	const cpDb = resolveDb(db);
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

	await cpDb
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

	// Per Task 15: link the local subscription row back to the org via
	// metadata.organizationId. Created by createCheckoutSession (Task 12)
	// on subscription_data.metadata. Silently no-op if absent or if the org
	// referenced doesn't exist.
	const orgIdFromMetadata = sub.metadata?.organizationId;
	if (orgIdFromMetadata) {
		const [localSub] = await cpDb
			.select({ id: subscriptions.id })
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, sub.id))
			.limit(1);
		if (localSub) {
			const paymentStatus = stripeStatusToPaymentStatus(sub.status);
			const updated = await cpDb
				.update(organizations)
				.set({ subscriptionId: localSub.id, paymentStatus, updatedAt: new Date() })
				.where(eq(organizations.id, orgIdFromMetadata))
				.returning({ id: organizations.id });
			if (updated.length === 0) {
				console.warn(
					`[saas-subscription] metadata.organizationId=${orgIdFromMetadata} not found; sub ${sub.id} unlinked`,
				);
			}
		}
	}
}

export async function markPastDue(
	stripeSubscriptionId: string,
	db?: CpDb,
	/**
	 * F-SAAS-3: Stripe event creation timestamp (unix seconds from event.created).
	 * Guards against out-of-order webhook delivery. `lastStripeEventAt` is the
	 * canonical anchor — `updatedAt` is the legacy-row fallback only.
	 */
	stripeEventCreatedAt?: number,
): Promise<void> {
	const cpDb = resolveDb(db);
	const now = new Date();

	// F-SAAS-3: Fetch the current row to check ordering before mutating.
	const [existing] = await cpDb
		.select({
			id: subscriptions.id,
			lastStripeEventAt: subscriptions.lastStripeEventAt,
			updatedAt: subscriptions.updatedAt,
			organizationId: subscriptions.stripeSubscriptionId,
		})
		.from(subscriptions)
		.where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
		.limit(1);

	if (!existing) {
		throw new Error(
			`markPastDue: no row for stripeSubscriptionId=${stripeSubscriptionId}`,
		);
	}

	// F-SAAS-3: Skip stale events. Anchor on lastStripeEventAt (canonical), fall
	// back to updatedAt for any legacy rows the backfill missed.
	const incomingEventDate =
		stripeEventCreatedAt !== undefined
			? new Date(stripeEventCreatedAt * 1000)
			: undefined;
	if (incomingEventDate !== undefined) {
		const anchor = existing.lastStripeEventAt ?? existing.updatedAt;
		if (anchor && incomingEventDate <= anchor) {
			console.warn(
				`[saas-subscription] markPastDue: skipping stale event (event.created=${incomingEventDate.toISOString()} <= lastStripeEventAt=${anchor.toISOString()}) for sub=${stripeSubscriptionId}`,
			);
			return;
		}
	}

	// F-SAAS-1 + F-SAAS-3: Update subscriptions AND organizations.paymentStatus atomically.
	// Also look up the linked organization via the subscriptions → organizations join so we
	// can update paymentStatus in the same transaction.
	await cpDb.transaction(async (tx) => {
		const [updated] = await tx
			.update(subscriptions)
			.set({
				status: "past_due",
				pastDueAt: now,
				gracePeriodEndsAt: new Date(now.getTime() + GRACE_PERIOD_MS),
				updatedAt: now,
				// F-SAAS-3: advance the canonical anchor on every Stripe-driven write.
				...(incomingEventDate !== undefined
					? { lastStripeEventAt: incomingEventDate }
					: {}),
			})
			.where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
			.returning({ id: subscriptions.id });

		if (!updated) {
			throw new Error(
				`markPastDue: update returned no row for stripeSubscriptionId=${stripeSubscriptionId}`,
			);
		}

		// F-SAAS-1: Propagate to organizations.paymentStatus so middleware lockout engages.
		await tx
			.update(organizations)
			.set({ paymentStatus: "past_due", updatedAt: now })
			.where(eq(organizations.subscriptionId, updated.id));
	});
}

export async function markActive(
	stripeSubscriptionId: string,
	db?: CpDb,
	/**
	 * F-SAAS-3: Stripe event creation timestamp (unix seconds from event.created).
	 * See markPastDue for the ordering-guard rationale; lastStripeEventAt is the
	 * canonical anchor.
	 */
	stripeEventCreatedAt?: number,
): Promise<void> {
	const cpDb = resolveDb(db);
	const now = new Date();

	// F-SAAS-3: Fetch the current row to check ordering before mutating.
	const [existing] = await cpDb
		.select({
			id: subscriptions.id,
			lastStripeEventAt: subscriptions.lastStripeEventAt,
			updatedAt: subscriptions.updatedAt,
		})
		.from(subscriptions)
		.where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
		.limit(1);

	if (!existing) {
		throw new Error(
			`markActive: no row for stripeSubscriptionId=${stripeSubscriptionId}`,
		);
	}

	// F-SAAS-3: Skip stale events. Anchor on lastStripeEventAt.
	const incomingEventDate =
		stripeEventCreatedAt !== undefined
			? new Date(stripeEventCreatedAt * 1000)
			: undefined;
	if (incomingEventDate !== undefined) {
		const anchor = existing.lastStripeEventAt ?? existing.updatedAt;
		if (anchor && incomingEventDate <= anchor) {
			console.warn(
				`[saas-subscription] markActive: skipping stale event (event.created=${incomingEventDate.toISOString()} <= lastStripeEventAt=${anchor.toISOString()}) for sub=${stripeSubscriptionId}`,
			);
			return;
		}
	}

	// F-SAAS-1 + F-SAAS-3: Update subscriptions AND organizations.paymentStatus atomically.
	await cpDb.transaction(async (tx) => {
		const [updated] = await tx
			.update(subscriptions)
			.set({
				status: "active",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				updatedAt: now,
				// F-SAAS-3: advance the canonical anchor on every Stripe-driven write.
				...(incomingEventDate !== undefined
					? { lastStripeEventAt: incomingEventDate }
					: {}),
			})
			.where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
			.returning({ id: subscriptions.id });

		if (!updated) {
			throw new Error(
				`markActive: update returned no row for stripeSubscriptionId=${stripeSubscriptionId}`,
			);
		}

		// F-SAAS-1: Propagate to organizations.paymentStatus.
		await tx
			.update(organizations)
			.set({ paymentStatus: "active", updatedAt: now })
			.where(eq(organizations.subscriptionId, updated.id));
	});
}

/**
 * F-SAAS-2: Past-due grace-period sweeper.
 *
 * Finds all subscriptions that are still in status='past_due' but whose
 * grace period has expired (gracePeriodEndsAt < now). Moves them to
 * status='unpaid' and sets organizations.paymentStatus='suspended' so the
 * orpc-tenant.middleware immediately starts blocking writes.
 *
 * Idempotent: once a row leaves past_due status (set to 'unpaid'), it no
 * longer matches the WHERE clause, so re-running in the same hour is a no-op.
 *
 * Called from the scheduled handler at 02:00 UTC alongside the installment
 * sweep and nightly reconciliation (Workers Free plan is capped at 5 crons;
 * we fold this into an existing slot rather than adding a 6th).
 */
export async function sweepPastDueSubscriptions(
	db?: CpDb,
): Promise<{ swept: number; orgsAffected: string[] }> {
	const cpDb = resolveDb(db);
	const now = new Date();

	// Find all subscriptions that are past_due with an expired grace period.
	const overdueRows = await cpDb
		.select({
			id: subscriptions.id,
			stripeSubscriptionId: subscriptions.stripeSubscriptionId,
			gracePeriodEndsAt: subscriptions.gracePeriodEndsAt,
		})
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.status, "past_due"),
				lt(subscriptions.gracePeriodEndsAt, now),
			),
		);

	if (overdueRows.length === 0) {
		return { swept: 0, orgsAffected: [] };
	}

	const affectedOrgIds: string[] = [];

	for (const row of overdueRows) {
		try {
			await cpDb.transaction(async (tx) => {
				// Mark subscription as unpaid (the Stripe status that follows past_due
				// once the grace period expires with no payment received).
				await tx
					.update(subscriptions)
					.set({ status: "unpaid", updatedAt: now })
					.where(eq(subscriptions.id, row.id));

				// F-SAAS-1 consistency: propagate to organizations.paymentStatus.
				const updatedOrgs = await tx
					.update(organizations)
					.set({ paymentStatus: "suspended", updatedAt: now })
					.where(eq(organizations.subscriptionId, row.id))
					.returning({ id: organizations.id });

				for (const org of updatedOrgs) {
					affectedOrgIds.push(org.id);
				}
			});

			console.log(
				`[saas-subscription] sweepPastDueSubscriptions: suspended sub=${row.stripeSubscriptionId} (gracePeriodEndsAt=${row.gracePeriodEndsAt?.toISOString()})`,
			);
		} catch (err) {
			// Log per-row failures and continue — a single bad row should not abort
			// the sweep for all other expired subscriptions.
			console.error(
				`[saas-subscription] sweepPastDueSubscriptions: failed for sub=${row.stripeSubscriptionId}:`,
				err,
			);
		}
	}

	console.log(
		`[saas-subscription] sweepPastDueSubscriptions: swept=${affectedOrgIds.length} orgs=[${affectedOrgIds.join(", ")}]`,
	);

	return { swept: affectedOrgIds.length, orgsAffected: affectedOrgIds };
}
