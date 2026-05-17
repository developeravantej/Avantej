# ADR 0034 — Tier Change Proration + Coupon Mechanism

Date: 2026-05-17
Status: Accepted

## Context

Plan F.3.5 ships the rest of billing depth: tier change mid-period,
coupons CRUD + apply to customer, `/billing` global page. Three locked
decisions documented here.

## Decisions

### 1. Tier change uses Stripe `proration_behavior: create_prorations`

`stripe.subscriptions.update(subId, { items: [{ id, price: NEW_PRICE_ID }], proration_behavior })`.

Three behavior options exposed:
- `create_prorations` (default) — Stripe generates proration invoice
  items added to the next regular invoice. Customer sees a single
  invoice with the proration credit/debit line. **Standard SaaS
  upgrade UX.**
- `none` — no proration. Customer pays the new tier from the next
  billing cycle; current period unaffected. Useful for graceful
  upgrades scheduled at cycle boundary.
- `always_invoice` — Stripe charges the proration immediately as a
  one-off invoice. Useful when ops wants the credit/debit settled now,
  not next month.

Ops picks per-change via radio in `TierChangeConfirmDialog`. Default is
`create_prorations` because it matches "fair" upgrades — customer pays
pro-rata for the time on the new tier.

Local `subscriptions.tier` + `subscriptions.stripePriceId` updated on
Stripe success. Audit row carries the proration invoice ID + amount
when retrievable (best-effort — proration retrieval failure does NOT
fail the whole tier change).

**Why not block downgrades:** ops should be able to issue a downgrade
mid-period (e.g., as a churn-prevention concession). Proration creates
a credit on next invoice — Stripe handles the math. We don't
artificially gate direction.

### 2. Coupons use Stripe's legacy `coupon` field on `customer`

Apply: `stripe.customers.update(customerId, { coupon: couponId })`.
Remove: `stripe.customers.deleteDiscount(customerId)`.

**Why legacy direct-coupon, not promotion codes:**
- Direct coupon API works today, no extra concept (promotion codes are
  customer-facing redemption codes; we're attaching ops-controlled
  discounts, no public code redemption flow).
- Avoids dual-discount-system confusion in ops UI for v1.
- Stripe documents the legacy path as still supported.
- If we ever need promotion codes (public coupon code distribution to
  customers), it's an additive API — no migration of existing coupon
  attachments required.

**Catalog:** `stripe.coupons.{list, create, delete}` directly. No
local mirror — same reasoning as ADR-0033 (Stripe is source of truth;
~tens of coupons at most; live reads are cheap).

**Audit strings:** `coupon_create`, `coupon_delete`, `coupon_apply`,
`coupon_remove`. One audit row per successful action; no row on
Stripe failure.

### 3. `/billing` global page uses live Stripe fan-out for cross-tenant invoices

`Promise.allSettled` over distinct active `stripeCustomerId`s, 5
invoices per customer, then merge + sort + take top 20.

**Why fan-out instead of a mirror table:**
- F.3-A locked live reads (ADR-0033). Same rationale applies at
  cross-tenant scope while tenant count is small.
- At ~10-50 tenants this is fine — ~10-50 Stripe calls in parallel,
  ~500ms total wall time.
- The aggregator caches nothing — each request fans out again.

**When this stops being fine (open follow-up):**
- Tenant count > 50, OR
- /billing page is auto-refreshing every N seconds (today it's manual
  navigation, no auto-refresh), OR
- Other readers (mission control, alerts) want the same cross-tenant
  invoice data
- → Open `tenant_billing_events` mirror table at that point per
  ADR-0033 condition #2 trigger. Migration slot reserved when
  scheduled (likely 0031 or later).

**Stripe-key-missing tolerance:** /billing aggregator catches Stripe
errors per fan-out, returns `stripeAvailable: false` flag with empty
coupons list. UI surfaces a banner. Other panels (KPIs, refund queue)
read from local DB only — unaffected.

## Consequences

- One new top-level router (`platformAdminCoupons` — Agent C2) for
  coupon catalog + per-customer attach/remove. Sibling to billing.
- One new top-level router (`platformAdminBilling` — Agent G) for
  global aggregator. Top-level matches mission control's
  `platformAdminDashboard` pattern.
- One new proc (`changeTier`) on existing
  `platformAdminTenantsBillingRouter` (Agent T2).
- Two new placeholder constants: `TIER_STRIPE_PRICE_IDS` (Agent T2) +
  `TIER_PRICES_USD_CENTS` (Agent P, F.2). Both have TODO comments
  pointing to real Stripe Dashboard values.
- Three new UI surfaces:
  - `<TierChangeCard />` on tenant Billing tab (super_admin)
  - `<CouponApplyCard />` on tenant Billing tab (super_admin)
  - `/dashboard/platform-admin/billing` global page (any platform-admin)
- All mutations super_admin-only (refunds + tier change + coupon
  create/delete/apply/remove). Support role can read everything,
  mutate nothing on billing surface.

## Alternatives considered

- **Tier change without proration choice.** Rejected: ops needs the
  flexibility (mid-period upgrades vs cycle-boundary upgrades vs
  immediate one-off charge). Three Stripe-native modes mapped 1:1.
- **Promotion codes for coupon attachment.** Rejected for v1; reserve
  for tenant-facing self-serve flows (Plan G+).
- **Mirror `customer.discount` state locally for faster reads.**
  Rejected: only one coupon attached per customer at a time, lookup is
  cheap (one Stripe call), source of truth confusion not worth the
  caching gain.
- **Cross-tenant invoice fetch via single Stripe query.** Stripe has
  no "invoices for all customers" endpoint that bypasses per-customer
  pagination. Per-customer fan-out is the only Stripe-native option
  short of a mirror table.

## Open follow-ups

- Real Stripe Dashboard price IDs for TIER_STRIPE_PRICE_IDS (placeholder
  for now). Same fix as TIER_PRICES_USD_CENTS — single-line constant
  change, no code change.
- Idempotency keys on tier change + coupon mutations (matching the
  ADR-0033 refund follow-up).
- Webhook handlers for `customer.subscription.updated` (already exists
  for sync) — confirm the local `subscriptions.tier` + `stripePriceId`
  updates wired by Agent T2 don't race with the webhook's syncing
  logic. Should be safe (idempotent write), but verify.
- `tenant_billing_events` mirror table when /billing global page
  starts feeling slow OR tenant count crosses ~50.
