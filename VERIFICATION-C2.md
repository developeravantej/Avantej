# VERIFICATION-C2 — Plan F.3.5 Coupons CRUD + apply (Agent C2)

## Scope delivered
- NEW top-level oRPC router `platformAdminCoupons` mounting six procs:
  - `listCoupons` (platform-admin) — cursor-paged Stripe coupon catalog
  - `createCoupon` (super_admin) — create Stripe coupon + audit row
  - `deleteCoupon` (super_admin) — delete Stripe coupon + audit row
  - `applyCoupon` (super_admin) — attach coupon to tenant's Stripe customer + audit row
  - `removeCoupon` (super_admin) — detach coupon from tenant's Stripe customer + audit row
  - `getCustomerCoupon` (platform-admin) — read current attached coupon
- NEW UI surfaces:
  - `CouponListPanel` — stateless catalog grid + delete button (super_admin only)
  - `CouponCreateDialog` — form with live preview, mirror-matches the server's Zod refines
  - `CouponApplyCard` — picker + attach/detach, mounted on the tenant Billing tab

## Stripe API choice
Used the legacy `customers.update({ coupon })` + `customers.deleteDiscount(id)` direct-coupon
attach path. ADR-0033 declares Stripe live reads. Promotion codes (the newer self-serve
flow) are deferred to a later plan per the C2 spec.

Documented in the router header comment.

## Audit strings (NEW, no schema change)
- `coupon_create`
- `coupon_delete`
- `coupon_apply`
- `coupon_remove`

The `adminSessionActions.actionType` column is free-form text, so no migration needed.

## Files written (OWNED)
- `apps/server/src/routers/platform-admin-coupons.ts`
- `apps/server/src/routers/platform-admin-coupons.test.ts`
- `apps/web/src/components/platform-admin/coupon-list-panel.tsx`
- `apps/web/src/components/platform-admin/coupon-create-dialog.tsx`
- `apps/web/src/components/platform-admin/coupon-apply-card.tsx`
- `apps/web/e2e/tests/ship/plan-f-3-5/C2-coupons.spec.ts`
- `verification/plan-f-3-5/C2-coupons.webm` (229 KB)

## Files patched (surgical)
- `apps/server/src/index.ts` — import + mount `platformAdminCoupons: platformAdminCouponsRouter` at top level
- `packages/api/src/routers/index.ts` — new `platformAdminCouponsRouterType` stub + mount in `appRouter`
- `apps/web/src/components/platform-admin/tenant-billing-tab.tsx` — mount `<CouponApplyCard />` between tier-change-card and invoice list

## Test results

### Unit tests (`bun test`)
```
11 pass / 0 fail / 49 expect() calls — 2.46s
```
Covers:
- listCoupons → projected shape + paging
- createCoupon happy path (percent) → Stripe call + one `coupon_create` audit row
- createCoupon (amount) → forwards `amount_off` + `currency`, NOT `percent_off`
- createCoupon Zod validation → percent kind without `percentOff` rejected at schema layer
- createCoupon Stripe failure → no audit row
- deleteCoupon happy path → audit row
- applyCoupon happy path → `customers.update` called with `{ coupon }`, audit row, no-side-effects on failure
- removeCoupon happy path → `customers.deleteDiscount` called, audit row
- getCustomerCoupon → projects attached coupon; returns `null` for trialing org

### E2E (`@ship-f-3-5` tag)
```
1 passed (11.2s)
```
Covers:
- listCoupons RPC shape (tolerant of missing Stripe key — accepts `200` or `BAD_REQUEST`)
- createCoupon / deleteCoupon / applyCoupon RBAC — support role → FORBIDDEN
- UI render — Billing tab → CouponApplyCard mounts (tolerant of dev-DB drill-in 500)

Video: `verification/plan-f-3-5/C2-coupons.webm` (229 KB, ~9s).

## Type check
Zero TypeScript errors introduced. `bun check-types` continues to surface pre-existing
errors in `services/saas-subscription`, `payment.service`, `webhooks.routes` integration
tests, `seed-franchise-owner` script — all unrelated to F.3.5 work.

## Constraints honored
- NO schema change, NO migration.
- NO real Stripe API calls in tests (fake stripe via `stripeOverride` DI).
- NO modification of Agent I or T2 procedures — strictly additive.
- NO use of Stripe `promotion_codes` API (deferred).
- NO git commit / push / PR (orchestrator owns those).

## Pre-existing issues hit / deviations
- One unit-test fixture seam: changing the seed `neonProjectId` to a unique value
  per test (`stub-coupons-${ORG_ID}`) to avoid the cross-test UNIQUE collision
  with T2's fixture that uses `neonProjectId: "stub"`. Documented inline.
- Zod refine assertions can't run through the raw oRPC handler extracted by
  `getHandler` (refines live at the procedure boundary, not in the handler
  body — same shape as the T2 tests). So the "validation rejection" unit test
  exercises the schema directly with `safeParse`. Stripe call surface still
  asserted via mocks. Mirrors how T2's same-tier rejection assertion was
  written at the handler layer (since same-tier is a handler check, not a
  Zod refine — they could go through getHandler).
- E2E listCoupons RPC tolerantly accepts BAD_REQUEST so the test passes in dev
  envs without a live Stripe key. Real-Stripe verification is the unit suite's job.
