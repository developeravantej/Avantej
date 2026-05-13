import { describe, it, expect } from "bun:test";
import { TIER_LIMITS, type Tier, getTierLimits, isFeatureEnabled } from "./tiers";

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
});

describe("isFeatureEnabled", () => {
  it("returns true when enabled on tier", () => {
    expect(isFeatureEnabled("professional", "memberships")).toBe(true);
  });
  it("returns false when disabled on tier", () => {
    expect(isFeatureEnabled("basic", "memberships")).toBe(false);
  });
});
