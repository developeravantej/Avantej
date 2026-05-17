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
 * TODO(plan-f-2): replace with real values from Stripe Dashboard.
 * These are PLACEHOLDER values for MRR/ARR estimation only.
 * Source of truth for billing is still Stripe (subscriptions.stripe_price_id).
 */
export const TIER_PRICES_USD_CENTS = {
  basic: 4900, // $49/mo  — TODO confirm with Stripe
  professional: 19900, // $199/mo — TODO confirm with Stripe
  enterprise: 49900, // $499/mo — TODO confirm with Stripe
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
 * TODO(plan-f-3-5): replace placeholders with real Stripe Dashboard price IDs.
 * Until those are wired in, `changeTier` will fail against real Stripe but
 * the deterministic stub in unit tests exercises the full code path.
 *
 * Source of truth for billing remains Stripe — this constant is the lookup
 * used when swapping a subscription's price item.
 */
export const TIER_STRIPE_PRICE_IDS = {
  basic: "price_placeholder_basic",
  professional: "price_placeholder_professional",
  enterprise: "price_placeholder_enterprise",
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
