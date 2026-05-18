# VERIFICATION-G — Plan F.3.5 Global Billing page (Agent G)

## Scope delivered
- NEW top-level oRPC router `platformAdminBilling` with two procedures:
  - `getOverview()` — single aggregator: KPIs (active subs, MRR, refunds 30d,
    active coupons) + recentInvoices (cross-tenant, top 20) + recentRefunds
    (top 20 from audit log) + activeCoupons (top 20 from Stripe).
  - `listInvoicesCrossTenant({ limit, days })` — explicit detailed cross-tenant
    invoice listing with date filter.
- NEW UI surface `/dashboard/platform-admin/billing`:
  - 4 BigNumberCard KPIs (active subs / MRR / refunds-30d / active-coupons)
  - 3 tabs: Recent invoices / Refund queue / Coupons (reuses `CouponListPanel`
    + `CouponCreateDialog` from Agent C2)
  - Refresh button, super-admin gating on "New coupon"
- NEW stateless components:
  - `RecentInvoicesPanel` — table, org-name → tenant drill-in link
  - `RefundQueuePanel` — table, red amount, reason chip, actor email

## Cross-tenant invoice fetch approach (per spec)
**Option A — live `Promise.allSettled` fan-out.** The router joins active
subscriptions to orgs, builds a `Map<stripeCustomerId, {orgId, orgName}>`, then
calls `stripe.invoices.list({ customer, limit: 5 })` for every distinct
customer in parallel. Results are flattened, sorted by `createdAt` DESC, and
truncated to the requested top-N.

- In dev with ~10 tenants → sub-second.
- At >50 tenants this becomes the slowest part of the page. Latency caveat
  documented in the router header. Future ADR-0033 condition #2 trigger calls
  for a mirror table when traffic warrants.
- All Stripe calls degrade gracefully: per-customer rejections are swallowed by
  `Promise.allSettled`; `stripe.coupons.list` is wrapped in try/catch and
  surfaces a `stripeAvailable: false` flag rather than throwing.

## KPI sources
| KPI | Source |
| --- | --- |
| `activeSubsCount` | `subscriptions` WHERE `status = 'active'` (rows from the same query that builds MRR) |
| `mrr.cents` | sum of `getTierPriceUsdCents(tier)` over `subscriptions` WHERE `status IN ('active','trialing')`. Mirrors the revenue router's logic verbatim. |
| `refundsLast30dCount` / `refundsLast30dAmountCents` | `admin_session_actions` WHERE `action_type = 'tenant_invoice_refund'` AND `created_at >= now() - 30d`. Amount parsed from `metadata.refundAmount` (falls back to `metadata.amountCents`). |
| `couponsCount` | length of `stripe.coupons.list({ limit: 20 })` (tolerant — 0 if Stripe unavailable). |

## Recent refunds shape
Joined to `organizations.name` (for tenant link) and `user.email` (Better-Auth,
for actor email). Sorted DESC by `created_at`. Metadata fields parsed in JS
from the `jsonb` column to keep the SQL minimal and portable.

## Files written (OWNED)
- `apps/server/src/routers/platform-admin-billing.ts`
- `apps/server/src/routers/platform-admin-billing.test.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/billing.tsx`
- `apps/web/src/components/platform-admin/recent-invoices-panel.tsx`
- `apps/web/src/components/platform-admin/refund-queue-panel.tsx`
- `apps/web/e2e/tests/ship/plan-f-3-5/G-billing-global.spec.ts`
- `verification/plan-f-3-5/G-billing-global.webm` (~330 KB, ~10s)
- `VERIFICATION-G.md`

## Files patched (surgical)
- `apps/server/src/index.ts` — import + mount `platformAdminBilling:
  platformAdminBillingRouter` at TOP level (NOT under `platformAdminTenants`).
- `packages/api/src/routers/index.ts` — new `platformAdminBillingRouterType`
  stub + mount in `appRouter` at top level.

NO schema change, NO migration, NO mirror table (per ADR-0033).

## Test results

### Unit tests (`bun test`)
```
3 pass / 0 fail / 40 expect() calls — 939 ms
```
Covers:
- `getOverview` happy path → KPI math, recentInvoices sort, recentRefunds
  joins to org + actor + newest-first ordering, activeCoupons projection,
  `stripeAvailable: true` flag.
- `getOverview` Stripe coupon failure → `activeCoupons: []`,
  `couponsCount: 0`, `stripeAvailable: false`.
- `listInvoicesCrossTenant` default args → shape assertion + our fixture row
  present.

Fake Stripe injected via the factory's `stripeOverride` DI hook — no network
call. Same `controlPanelDb` cleanup pattern as C2 (filter to this test's user
+ unique fixture IDs).

### E2E (`@ship-f-3-5` tag)
```
1 passed (11.9s)
```
Covers (all in one spec):
1. `getOverview` RPC — shape assertion (kpis, recentInvoices, recentRefunds,
   activeCoupons, stripeAvailable).
2. `listInvoicesCrossTenant` RPC — shape assertion with defaults.
3. UI render — heading, 4 KPI cards, 3 tabs all visible.
4. Tab switching — invoices → refunds → coupons.
5. Org-link navigation — best-effort: clicks first org link if data is
   present, asserts URL changes to `/dashboard/platform-admin/tenants/<id>`.
6. RBAC — support role gets 200 on `getOverview`; coupons tab does NOT show
   "New coupon" button.

Video: `verification/plan-f-3-5/G-billing-global.webm` (~330 KB).

## Type check
Zero TypeScript errors introduced by Agent G files. Pre-existing errors in
`services/saas-subscription`, `payment.service`, `webhooks.routes` integration
tests, `seed-franchise-owner` script remain unrelated.

## Constraints honored
- NO schema change, NO migration.
- NO real Stripe API calls in tests (fake stripe via `stripeOverride` DI).
- TOP-LEVEL mount confirmed in both `apps/server/src/index.ts` and
  `packages/api/src/routers/index.ts`.
- Did NOT touch Agent I / T2 / C2 procs — `platformAdminBilling` is purely
  read-aggregator; coupon mutations from this page reuse C2's
  `platformAdminCoupons.createCoupon` / `deleteCoupon`.
- Latency caveat documented in router header (Option A → consider mirror
  table at >50 tenants per ADR-0033 #2).
- Stripe-key-absent tolerance: `stripe.coupons.list` failures degrade to
  `activeCoupons: []` + `stripeAvailable: false` flag; per-customer invoice
  fetch uses `Promise.allSettled`.

## Deviations
None. Followed the spec verbatim — Option A cross-tenant fetch, top-level
router mount, KPI sources matching brief, UI reuses BigNumberCard +
CouponListPanel + CouponCreateDialog.

## Pre-existing issues
- `getTenantDetail` 500 in dev — relevant only if the e2e "org-link nav"
  scenario lands on the drill-in page. The test asserts only the URL change
  before going back, so it tolerates the broken drill-in.
- Stripe live keys may be absent in CI — `stripeAvailable: false` banner
  surfaces in the UI; the unit test second case covers the degradation path.
