export const TIER_LIMITS = {
	basic: {
		organizations: 1,
		locations: 1,
		members: 25,
		customers: 100,
		monthlyTxns: 100,
		appFeeBps: 300, // 3%
		features: {
			ghl: false,
			googleCalendar: true,
			commissionSplits: false,
			memberships: false,
			apiAccess: false,
		},
		analyticsLevel: "basic" as const,
		auditLogDays: 30,
	},
	professional: {
		organizations: 5,
		locations: 10,
		members: 100,
		customers: 1000,
		monthlyTxns: 1000,
		appFeeBps: 200, // 2%
		features: {
			ghl: true,
			googleCalendar: true,
			commissionSplits: true,
			memberships: true,
			apiAccess: true,
		},
		analyticsLevel: "advanced" as const,
		auditLogDays: 365,
	},
	enterprise: {
		organizations: Number.MAX_SAFE_INTEGER,
		locations: Number.MAX_SAFE_INTEGER,
		members: Number.MAX_SAFE_INTEGER,
		customers: Number.MAX_SAFE_INTEGER,
		monthlyTxns: Number.MAX_SAFE_INTEGER,
		appFeeBps: 150, // 1.5%
		features: {
			ghl: true,
			googleCalendar: true,
			commissionSplits: true,
			memberships: true,
			apiAccess: true,
		},
		analyticsLevel: "advanced" as const,
		auditLogDays: 365 * 7,
	},
} as const;

export type Tier = keyof typeof TIER_LIMITS;
export type TierLimits = (typeof TIER_LIMITS)[Tier];
export type TierFeature = keyof TierLimits["features"];

export function getTierLimits<T extends Tier>(tier: T): (typeof TIER_LIMITS)[T];
export function getTierLimits(tier: string): TierLimits;
export function getTierLimits(tier: string): TierLimits {
	if (Object.hasOwn(TIER_LIMITS, tier)) return TIER_LIMITS[tier as Tier];
	return TIER_LIMITS.basic;
}

export function isFeatureEnabled(tier: Tier, feature: TierFeature): boolean {
	return TIER_LIMITS[tier].features[feature];
}

/**
 * Monthly tier prices in USD cents.
 * Verified against Stripe Dashboard 2026-05-18 (test mode).
 * Source of truth for billing remains Stripe (subscriptions.stripe_price_id).
 * Update here when Stripe price amounts change.
 */
export const TIER_PRICES_USD_CENTS = {
	basic: 4900, // $49/mo
	professional: 14900, // $149/mo
	enterprise: 49900, // $499/mo
} as const;

export type TierPrice = (typeof TIER_PRICES_USD_CENTS)[Tier];

/**
 * Returns the monthly USD-cents price for a tier, or 0 for unknown tiers.
 * Used by aggregator surfaces (mission control, /revenue) to estimate MRR.
 * Billing remains driven by Stripe — this is a display-only helper.
 */
export function getTierPriceUsdCents(tier: Tier): number {
	if (Object.hasOwn(TIER_PRICES_USD_CENTS, tier)) {
		return TIER_PRICES_USD_CENTS[tier];
	}
	return 0;
}

/**
 * Stripe price IDs per tier (used by ops-driven tier swaps in Plan F.3.5).
 * Verified against Stripe Dashboard 2026-05-18 (test mode).
 * Source of truth for billing remains Stripe — this constant is the lookup
 * used when swapping a subscription's price item.
 *
 * Products:
 *   prod_UVqsQazIztZqfS  Avantej SaaS — Basic
 *   prod_UVqsZBA7b1wzXZ  Avantej SaaS — Professional
 *   prod_UVqst9vw3jnp1Q  Avantej SaaS — Enterprise
 */
export const TIER_STRIPE_PRICE_IDS = {
	basic: "price_1TWpATB3sd6uw5s66NOdeZMR",
	professional: "price_1TWpAUB3sd6uw5s6ezbLau1c",
	enterprise: "price_1TWpAWB3sd6uw5s6mQQIavDR",
} as const;

export type TierStripePriceId = (typeof TIER_STRIPE_PRICE_IDS)[Tier];

/**
 * Returns the Stripe price ID for a tier. Throws if the tier is not in
 * the mapping — callers are responsible for validating the input tier
 * against the `Tier` union first.
 */
export function getTierStripePriceId(tier: Tier): string {
	if (Object.hasOwn(TIER_STRIPE_PRICE_IDS, tier)) {
		return TIER_STRIPE_PRICE_IDS[tier];
	}
	throw new Error(`Unknown tier for Stripe price lookup: ${tier}`);
}

/**
 * Subscription statuses that count as "live" — the tenant is paying, in a
 * trial, or within the past-due grace window (ADR-0009). Any other status
 * (canceled / unpaid / incomplete / paused) is NOT live and falls back to the
 * basic tier for entitlement + fee purposes. Values mirror Stripe subscription
 * statuses.
 */
export const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
	"active",
	"trialing",
	"past_due",
]);

/**
 * Resolve a tenant's EFFECTIVE tier and application-fee basis points from its
 * subscription row. The single source of truth for "what tier/fee applies right
 * now", shared by the Connect charge path and the platform-admin feature-flags
 * view so they cannot diverge.
 *
 * A non-live subscription (canceled/unpaid/etc.) — or no subscription, or an
 * unrecognized tier — resolves to the basic tier. This prevents a lapsed tenant
 * from keeping a higher tier's discounted application fee (a canceled enterprise
 * tenant previously kept the 1.5% fee, under-collecting platform revenue).
 *
 * `tier` is `null` when there is no live, recognized tier; callers that need a
 * concrete tier treat `null` as basic. `appFeeBps` is always concrete.
 */
export function resolveEffectiveTier(
	sub: { tier: string; status: string } | null | undefined,
): { tier: Tier | null; appFeeBps: number } {
	if (sub && LIVE_SUBSCRIPTION_STATUSES.has(sub.status)) {
		const tier =
			sub.tier === "basic" ||
			sub.tier === "professional" ||
			sub.tier === "enterprise"
				? sub.tier
				: null;
		return {
			tier,
			appFeeBps: (tier ? TIER_LIMITS[tier] : TIER_LIMITS.basic).appFeeBps,
		};
	}
	return { tier: null, appFeeBps: TIER_LIMITS.basic.appFeeBps };
}
