import { describe, it, expect } from "bun:test";
import {
  TIER_LIMITS,
  TIER_PRICES_USD_CENTS,
  type Tier,
  getTierLimits,
  getTierPriceUsdCents,
  isFeatureEnabled,
} from "./tiers";

describe("TIER_LIMITS", () => {
  it("defines three tiers: basic, professional, enterprise", () => {
    expect(Object.keys(TIER_LIMITS).sort()).toEqual([
      "basic",
      "enterprise",
      "professional",
    ]);
  });

  it("enterprise has the lowest application fee bps", () => {
    expect(TIER_LIMITS.enterprise.appFeeBps).toBeLessThan(
      TIER_LIMITS.professional.appFeeBps,
    );
    expect(TIER_LIMITS.professional.appFeeBps).toBeLessThan(
      TIER_LIMITS.basic.appFeeBps,
    );
  });

  it("enterprise unlocks all v2 features", () => {
    expect(TIER_LIMITS.enterprise.features.memberships).toBe(true);
    expect(TIER_LIMITS.enterprise.features.commissionSplits).toBe(true);
    expect(TIER_LIMITS.enterprise.features.ghl).toBe(true);
  });

  it("basic disables tiered features", () => {
    expect(TIER_LIMITS.basic.features.ghl).toBe(false);
    expect(TIER_LIMITS.basic.features.memberships).toBe(false);
  });
});

describe("getTierLimits", () => {
  it("returns limits for a known tier", () => {
    expect(getTierLimits("basic").organizations).toBe(1);
  });

  it("falls back to basic for an unknown tier string", () => {
    expect(getTierLimits("unknown" as Tier).organizations).toBe(
      TIER_LIMITS.basic.organizations,
    );
  });

  it("falls back to basic for prototype-chain keys like 'toString'", () => {
    expect(getTierLimits("toString" as Tier).organizations).toBe(
      TIER_LIMITS.basic.organizations,
    );
    expect(getTierLimits("constructor" as Tier).organizations).toBe(
      TIER_LIMITS.basic.organizations,
    );
  });
});

describe("TIER_PRICES_USD_CENTS", () => {
  it("defines the same three tiers as TIER_LIMITS", () => {
    expect(Object.keys(TIER_PRICES_USD_CENTS).sort()).toEqual(
      Object.keys(TIER_LIMITS).sort(),
    );
  });

  it("has positive integer prices for every tier", () => {
    for (const tier of Object.keys(TIER_PRICES_USD_CENTS) as Tier[]) {
      const price = TIER_PRICES_USD_CENTS[tier];
      expect(Number.isInteger(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
    }
  });
});

describe("getTierPriceUsdCents", () => {
  it("returns the basic price for the basic tier", () => {
    expect(getTierPriceUsdCents("basic")).toBe(TIER_PRICES_USD_CENTS.basic);
  });

  it("returns 0 for unknown tiers", () => {
    expect(getTierPriceUsdCents("unknown" as Tier)).toBe(0);
  });

  it("returns 0 for prototype-chain keys like 'toString'", () => {
    expect(getTierPriceUsdCents("toString" as Tier)).toBe(0);
    expect(getTierPriceUsdCents("constructor" as Tier)).toBe(0);
  });
});

describe("isFeatureEnabled", () => {
  it("returns true when enabled on tier", () => {
    expect(isFeatureEnabled("professional", "memberships")).toBe(true);
  });
  it("returns false when disabled on tier", () => {
    expect(isFeatureEnabled("basic", "memberships")).toBe(false);
  });
});
