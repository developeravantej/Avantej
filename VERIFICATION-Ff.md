# Verification — Plan F.4 Agent Ff (Tenant Feature flags tab)

## Scope
Read-only Feature flags tab on the `tenants.$id` drill-in. v1 derives
features + tier limits purely from `TIER_LIMITS[tier]` in
`@avantej-core/types`. Per-tenant overrides are deferred to F.4.5+
(would need a `tenant_feature_overrides` table — out of scope here).
`source` is therefore always `"tier_default"` in v1.

## Files added
- `apps/server/src/routers/platform-admin-tenants-feature-flags.ts`
- `apps/server/src/routers/platform-admin-tenants-feature-flags.test.ts`
- `apps/web/src/components/platform-admin/tenant-feature-flags-tab.tsx`
- `apps/web/src/components/platform-admin/feature-flag-card.tsx`
- `apps/web/e2e/tests/ship/plan-f-4/Ff-feature-flags.spec.ts`
- `verification/plan-f-4/Ff-feature-flags.webm` (507K)
- `VERIFICATION-Ff.md` (this file)

## Files patched (surgical)
- `apps/server/src/index.ts` — import + mount
  `featureFlags: platformAdminTenantsFeatureFlagsRouter` under
  `platformAdminTenants`.
- `packages/api/src/routers/index.ts` —
  `platformAdminTenantsFeatureFlagsRouterType` stub +
  `featureFlags:` mount in the `platformAdminTenants` type tree.
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/tenants.$id.tsx`
  — import `TenantFeatureFlagsTab`, add `<TabsTrigger value="feature-flags">Feature flags</TabsTrigger>`
  + matching `<TabsContent value="feature-flags">…</TabsContent>` between Members and Actions.

## API surface (under `platformAdminTenants.featureFlags`)
- `get({ organizationId })` → `{ organizationId, tier, features,
  tierLimits, source }`.
  - Looks up `organizations` by id; throws `NOT_FOUND` when the org is
    missing.
  - Reads `subscriptions.tier` via `organizations.subscriptionId`;
    when the subscription's status is one of `active | trialing |
    past_due` we honor it. Cancelled / unpaid / missing → fallback to
    `basic`. This is the documented "no active subscription → basic"
    behaviour.
  - Returns `features` + `tierLimits` from `getTierLimits(tier)`.
  - `source` is always `"tier_default"` in v1 — the union shape is
    fixed now so F.4.5 can flip individual rows to `"override"`
    without a contract change.

## RBAC
- `requirePlatformAdmin()` middleware (mirrors Members tab). Any
  platform-admin role (super_admin / support / billing) can read.
  Verified end-to-end with the support role in scenario 5.

## Unit tests
`apps/server/src/routers/platform-admin-tenants-feature-flags.test.ts`:
- ✅ Returns `TIER_LIMITS[basic].features` for a basic-subscribed org.
- ✅ Returns `TIER_LIMITS[professional].features` for a
  professional-subscribed org.
- ✅ Returns `TIER_LIMITS[enterprise].features` for an
  enterprise-subscribed org.
- ✅ Falls back to `basic` when the organization has no subscription.
- ✅ Falls back to `basic` when the subscription is cancelled.
- ✅ Honors the tier when subscription status is `trialing`.

Result: `6 pass, 0 fail, 19 expect() calls`.

## Playwright spec
`apps/web/e2e/tests/ship/plan-f-4/Ff-feature-flags.spec.ts` (tag
`@ship-f-4`). One test, five scenarios:
1. **get RPC shape** — validates `organizationId / tier / features /
   tierLimits / source` exist + correct types.
2. **TIER_LIMITS parity** — `features` deep-equal
   `TIER_LIMITS[returned.tier].features` and `tierLimits.appFeeBps`
   matches.
3. **Unknown org tolerant path** — 200 (with valid tier) or 404
   accepted; soft-checked.
4. **UI render** — navigate to drill-in, click Feature flags tab,
   assert tier chip + grid + limits panel + 5 feature cards.
5. **RBAC** — flips admin to `support` role, expects 200/404 (never
   FORBIDDEN).

Result: `1 passed (23.4s)`.

Video: `verification/plan-f-4/Ff-feature-flags.webm` (519 KB).

## UI design
- Header card with "Feature flags" title + tier chip; subline notes
  v1 read-only + `source: tier_default`.
- 5-card grid (responsive 1/2/3 columns) — `FeatureFlagCard`:
  - Green ring + ON badge when enabled, opacity-dimmed + OFF badge
    otherwise.
  - Icon + name on the left, `ON`/`OFF` badge on the right,
    description in muted text below.
- "Tier limits" card — 8 `<LimitBadge />` chips: organizations,
  locations, members, customers, monthly txns, app fee %, analytics
  level, audit log days. `Number.MAX_SAFE_INTEGER` rendered as
  "Unlimited".
- Footer note: "To change tier and unlock different features, use the
  Billing tab → Tier change."

## Type-check / lint
- `bun check-types`: pre-existing failures in
  `saas-subscription.service.integration.test.ts`,
  `webhook-dedupe.service.integration.test.ts`, and
  `tests/integration/org.test.ts` — **unrelated** to this change. No
  errors in any of the new / patched files.
- `apps/web tsc --noEmit`: one pre-existing error in `comms.tsx`
  (priority `null` vs union) — unrelated.

## Known constraints / pre-existing issues touched but not fixed
- `getTenantDetail` 500 — when the surrounding drill-in page chrome
  fails, the Feature flags tab can't be clicked. The spec tolerates
  this (scenario 4 logs + soft-fails the UI block but continues to
  exercise the RPC + RBAC).
- Per-tenant overrides — deferred to F.4.5+ per the plan.
  `source: "override"` is reserved in the contract but never returned
  in v1.

## Deviations from plan
None. All pre-declared symbols
(`platformAdminTenantsFeatureFlagsRouter`,
`platformAdminTenantsFeatureFlagsRouterType`, mount key
`featureFlags`, components `TenantFeatureFlagsTab` +
`FeatureFlagCard`) used verbatim. No new schema, no migration, no
mutations.
