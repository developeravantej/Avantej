# VERIFICATION — Plan F.2 Agent P (prep work)

Branch: `plan-f-2-revenue`
Base HEAD: `52ce475` (F.1.5 docs commit)
Agent: P — TIER_PRICES_USD_CENTS scaffold + listTenants cast fix + MRR wiring.

## Files patched

### packages/types/src/tiers.ts
Appended after `isFeatureEnabled`:
- `TIER_PRICES_USD_CENTS = { basic: 4900, professional: 19900, enterprise: 49900 } as const` (USD cents — placeholder values, marked TODO).
- `type TierPrice = (typeof TIER_PRICES_USD_CENTS)[Tier]`.
- `getTierPriceUsdCents(tier: Tier): number` with `Object.hasOwn` guard; returns 0 for unknown tiers (matches plan spec).
- JSDoc explicitly states billing remains Stripe-driven; constant feeds MRR/ARR display only.
TIER_LIMITS unchanged.

### packages/types/src/tiers.test.ts
Added `describe("TIER_PRICES_USD_CENTS", …)` block (same-keys, positive-integer tests) and `describe("getTierPriceUsdCents", …)` block (happy-path + unknown-tier fallback + prototype-chain guard). 14 tests pass; 0 failed.

### apps/server/src/routers/platform-admin-tenants.ts
Imported `inArray` from `drizzle-orm`. Replaced inside the connect-account rollup query:
```ts
// before
.where(sql`${orgCountryStripeAccounts.organizationId} = ANY(${orgIds}::uuid[])`)
// after — single-line comment + inArray
.where(inArray(orgCountryStripeAccounts.organizationId, orgIds))
```
Comment documents the root cause (Neon serverless driver binds JS arrays as `record`, which PG refuses to cast to `uuid[]`).

### apps/server/src/routers/platform-admin-dashboard.ts
- Imported `inArray` from `drizzle-orm` and `{ getTierPriceUsdCents, type Tier }` from `@avantej-core/types`.
- Added a fourth parallel read to the `Promise.all([...])` array — `select({ tier }) from subscriptions where status in ('active','trialing')` — destructured as `activeSubTiers`.
- Removed the `TODO(plan-f-1-5)` comment block and replaced the stub with:
  ```ts
  const mrrCents = activeSubTiers.reduce(
    (sum, row) => sum + getTierPriceUsdCents(row.tier as Tier),
    0,
  );
  const mrrEstimateAvailable = true;
  ```
- Updated the file-header doc-block from "MRR deferred — flag false" to "Plan F.2 — sums TIER_PRICES_USD_CENTS …".

## listTenants fix — root cause

Pattern was `sql\`${col} = ANY(${jsArray}::uuid[])\``. Drizzle interpolates the JS string array as a single parameterised value; `@neondatabase/serverless` binds JS arrays with no element-type hint, so PostgreSQL sees `record` as the source type and rejects `cast type record to uuid[]`.

Fix: drizzle's `inArray(col, jsArray)` expands the array into individual `IN (?, ?, …)` placeholders, each bound as a uuid text literal — no record-cast required. Drop-in replacement; no callsite changes elsewhere.

## TIER_PRICES values

Used the exact scaffold values from the plan brief:
```ts
basic: 4900         // $49/mo  — TODO confirm with Stripe
professional: 19900 // $199/mo — TODO confirm with Stripe
enterprise: 49900   // $499/mo — TODO confirm with Stripe
```
TODO markers + JSDoc note that Stripe remains source of truth for billing.

## Unit-test result
```
$ cd packages/types && bun test
 14 pass
  0 fail
 25 expect() calls
Ran 14 tests across 1 file. [7.00ms]
```

## Type-check result
`bun check-types` from `apps/server` shows no errors in the patched files. Pre-existing test-file type-errors (saas-subscription.service.integration.test.ts, webhook-dedupe.service.integration.test.ts, org.test.ts) are unrelated — they predate this branch.

## Playwright result

Spec: `apps/web/e2e/tests/ship/plan-f-2/P-prep.spec.ts`
Tag:  `@ship-f-2`
Run:  `npx playwright test e2e/tests/ship/plan-f-2/P-prep.spec.ts`
Result: **1 passed (11.1s)**

| # | Scenario | Outcome |
|---|---|---|
| 1 | `listTenants({page:1,limit:50})` RPC golden | 200 OK; `total=9 tenants[]`. No "cannot cast type record" in body. |
| 2 | `listTenants({paymentStatus:'active'})` filter | 200 OK; every returned tenant has `paymentStatus === 'active'`. |
| 3 | `/dashboard/platform-admin/tenants` UI render | No 500 overlay (HTML free of `Internal Server Error / 500`). |
| 4 | `getOverview()` MRR shape | `mrr.estimateAvailable === true`, `mrr.cents === 268500` (≥ 0). |
| 5 | `/dashboard/platform-admin/` MRR card | "Mission Control" heading visible; `kpi-mrr` card text `"MRR (estimate)$2,685"` — no `—` placeholder. |

## Video
- Path: `verification/plan-f-2/P-prep.webm`
- Size: 315 KB (323116 bytes)

## Pre-existing issues hit
- 400 console errors visible while loading `/dashboard/platform-admin/tenants` (`[browser-console-error] Failed to load resource: 400`). These are unrelated to the cast bug — they originate from downstream RPCs the tenants page calls. Page still renders without a 500 overlay (scenario 3 passes). Documented for Agent V.
- Pre-existing type-errors in three integration test files (listed above) — outside scope.

## DO-NOT acknowledgements
- No commits / pushes — orchestrator owns commits.
- No PR opened.
- TIER_LIMITS values untouched.
- No migrations added.
- TIER_PRICES values carry TODO + JSDoc explicitly flagging them as placeholders.
