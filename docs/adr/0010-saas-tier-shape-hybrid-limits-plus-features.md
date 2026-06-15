# ADR 0010 — SaaS Tier Shape: Hybrid Quantitative Limits + Feature Flags

Date: 2026-05-13
Status: Accepted

## Context

The SaaS subscription has three tiers (Basic, Professional, Enterprise). The control-panel `subscriptions` table already carries `tier` and `organizationCountLimit`, but the broader tier model is otherwise undefined. With 60+ services and a wide feature surface, we must decide how tiers gate functionality and how that gating is implemented.

Options: pure quantitative limits (counts of resources only), pure feature flags (binary per-tier capabilities), or hybrid.

## Decision

Adopt a **hybrid model**: each tier defines both quantitative resource limits and binary feature flags.

**Single source of truth** at `packages/types/src/tiers.ts`:

```ts
export const TIER_LIMITS = {
  basic: {
    organizations: 1,
    locations: 1,
    members: 25,
    customers: 100,
    monthlyTxns: 100,
    appFeePercent: 0.03,
    features: { ghl: false, commissionSplits: false, memberships: false, apiAccess: false },
    analyticsLevel: "basic",
    auditLogDays: 30,
  },
  professional: { /* ... */ appFeePercent: 0.02, features: { ghl: true, commissionSplits: true, memberships: true, apiAccess: true } },
  enterprise: { /* ... */ appFeePercent: 0.015, features: { /* all true */ }, ... },
} as const;
```

**Application fee** is tier-driven (3% / 2% / 1.5% in v1 defaults) and stored as basis points on `subscriptions.applicationFeeBps`. Sales can override for negotiated enterprise contracts via an admin tool.

**Enforcement:**
- **Feature flags** — middleware `requireTierFeature("ghl")` decorates oRPC procedures whose use is tier-gated. Failure returns error code `TIER_FEATURE_LOCKED` with the minimum required tier.
- **Quant limits** — checked at write-time via `assertWithinLimit(context, "customers")` helper. Failure returns error code `TIER_LIMIT_REACHED` with current usage, limit, and required-upgrade tier. Counts are computed on demand against tenant DB in v1; cached counter is a v2 optimization.

**Soft cap on downgrade:** Tenants who downgrade and exceed limits keep their existing data. Further write operations are blocked until they reduce usage or upgrade. No automatic deactivation.

## Consequences

Positive:
- Pricing page can differentiate cleanly on both volume and capability.
- App-fee gradient (3% → 1.5%) creates a natural upgrade incentive as Tenants grow.
- Single tier-config file makes the entire pricing model auditable.
- Middleware-driven enforcement keeps the gating logic out of business-service code.

Negative:
- Tier numbers (25 members, 100 customers, etc.) are guesses; will need re-tuning based on real cohort data after pilot. Mitigated by treating `TIER_LIMITS` as configuration that can change without schema migration.
- Soft-cap downgrade UX is awkward — Tenant sees their app working but write-blocked. Acceptable; the alternative (auto-deletion) is worse.
- Quant-limit checks read-on-demand can add latency to write paths once Tenants get large; v2 introduces a denormalized counter cache.

## Alternatives considered

- **Pure quantitative limits** — Too inflexible; some features (GHL, commissions) are clear cap-ex/value differentiators that don't reduce to counts.
- **Pure feature flags** — Loses the upsell mechanism for high-volume Tenants on cheap plans.
- **Defer tier enforcement to v2** — Pricing page would lack credibility; sales conversations need real gates.
