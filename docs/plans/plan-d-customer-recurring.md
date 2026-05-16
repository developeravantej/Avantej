# Plan D — Customer Experience & Recurring Revenue

**Status:** Scoped, not yet implemented
**Branch (when started):** `customer-revenue` (off `payment-integrity` tip)
**Estimated effort:** ~50h focused work (~1.5 weeks)
**Author:** Scoped 2026-05-16 (after Plan C shipped)

## What Plan D is

The **customer-facing surface** + **recurring revenue engine** on top of
Plan B (transactional) + Plan C (integrity). Plan B made money flow safely;
Plan C made it auditable; Plan D turns the infrastructure into product
features customers and tenants pay for.

## Why now

Plan B + C close the technical infrastructure gaps. Plan D unlocks revenue
levers that depend on that infrastructure being reliable:

1. **Recurring memberships at scale** — gyms/spas live on monthly auto-charges.
   Today: `chargeSavedCard` works but has no dunning / retry / SCA escalation,
   and there's no customer-facing billing portal.
2. **No-show recovery** — pre-authorize at booking, capture on attendance
   or void on cancel. Industry standard.
3. **Customer self-service** — receipts, refund requests, card updates.
   Today: 100% staff-mediated. Customer trust + support cost both lose.
4. **SCA / 3DS in-app** — ADR-0016 v1 punt. Real-world hit rate on MY-issued
   cards is ~5-15%; without an in-app challenge UI, those charges fail.

## Primary persona

**Customer-first + tenant-facing tools, NOT platform-ops.** Avantej ops
features stay in Plan C. Plan D is "how does the franchise + their
customers use the payment system day-to-day."

## Locked design decisions (proposed — to be confirmed via /grill-me before kickoff)

| Decision | Recommended choice | Reasoning |
|----------|--------------------|-----------|
| Membership engine | **Stripe Subscriptions on Connect** | Native dunning, customer billing portal, SCA handled by Stripe — massive ops savings vs DIY chargeSavedCard cron |
| Customer auth | **No new auth surface** — receipts/refunds/card-update via signed magic-link URLs sent at charge time | Avoids building a customer login + reset flow; aligned with v1 minimum-viable surface |
| SCA / 3DS UX | **In-app challenge modal** (Stripe.js `handleNextAction`) when `chargeSavedCard` returns `requires_action` | Eliminates staff out-of-band coordination; standard Stripe pattern |
| Pre-auth holds | **PaymentIntent w/ `capture_method: manual`** at booking, capture at attendance, cancel/release on cancellation | Same charge primitive; no separate "hold" entity |
| Refund requests | **New `refund_requests` tenant DB table** — customer submits, staff approves (creates an actual Stripe refund) | Audit trail + staff override |
| Partial refunds | **Extend `payments.refund` proc** w/ optional `amount` arg, default = full | Reuses existing snapshot pattern |
| Card-update flow | **SetupIntent against same Stripe Customer** + UPDATE `default_payment_method_id` on success | Builds on Phase 3d primitives |
| Multi-method storage | **Drop `default_payment_method_id` single field** — switch to deriving "default" from list-by-`default=true` query | Simpler than separate table; relies on Stripe-side `customer.invoice_settings.default_payment_method` |

## Phase breakdown

Ordering note: D.1 + D.2 are independent; D.3 + D.4 build on the magic-link
primitive; D.5 + D.6 enhance existing flows; D.7 + D.8 are independent
quality-of-life features.

| # | Phase | What | Est | Deps |
|---|-------|------|-----|------|
| D.1 | Stripe Subscriptions on Connect for memberships | Replace `chargeSavedCard` cron-style renewal w/ `stripe.subscriptions.create({...}, { stripeAccount })`. Webhook handlers for `customer.subscription.*` on connect endpoint. Tenant UI "Sell membership" replaces / supplements current package purchase. | 12h | C.1 (backfill catches subscription events too) |
| D.2 | Pre-authorize holds on appointment booking | New `payments.preauthorize({ appointmentId })` proc — PI with `capture_method=manual`. New `payments.captureHold` + `payments.releaseHold`. Webhook updates. UI: "Reserve" button on booking. | 6h | Plan B Phase 2 |
| D.3 | Magic-link customer portal foundation | New `customer_portal_tokens` tenant table. Sign-on-charge: every charge emails customer a one-time link `/portal/<token>` valid 30d. Token route renders read-only receipt + actions (refund request, card update). | 8h | Plan B Phase 3a (we already send receipts) |
| D.4 | Customer refund-request flow | `refund_requests` tenant table. Customer submits via magic-link portal. Staff sees request in appointment dialog → approve creates Stripe refund (existing `payments.refund` proc). Email both parties on each step. | 6h | D.3 |
| D.5 | In-app SCA / 3DS challenge | `ChargeDialog` checks PI status post-confirm; if `requires_action`, mounts Stripe.js `handleNextAction()` modal. Same for `chargeSavedCard` UI (off-session → on-session escalation). | 4h | Plan B Phase 3d |
| D.6 | Partial refunds | Extend `payments.refund` proc with optional `amount`. UI: refund dialog gets amount input (default = full). | 3h | Plan B Phase 3b |
| D.7 | Card-update via magic-link or in-app | Magic-link portal: "Update card" → new SetupIntent against same Stripe Customer → on succeed, `default_payment_method_id` swap. Also exposed as a tenant action on customer detail page. | 4h | D.3 + Plan B Phase 3d |
| D.8 | Multi-method card storage | Drop `default_payment_method_id` single column; derive default from Stripe-side `customer.invoice_settings.default_payment_method`. Saved-cards UI gets "Set as default" per row. | 4h | Plan B Phase 3d |
| D.9 | Pending-package cleanup sweeper | Daily cron — mark `package_instances` with `payment_status="pending"` AND `created_at < now - 7d` as `cancelled`. Email tenant on bulk-cancel. | 3h | C.1 (cron infrastructure) |

## New schemas

**Tenant DB:**

```sql
-- D.3
CREATE TABLE customer_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,           -- 32-char URL-safe random
  customer_profile_id uuid REFERENCES customer_profiles(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
  expires_at timestamp NOT NULL,         -- created_at + 30d
  consumed_actions jsonb DEFAULT '[]',   -- log of which portal actions ran on this token
  revoked_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX customer_portal_tokens_token_idx ON customer_portal_tokens (token);

-- D.4
CREATE TABLE refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  customer_profile_id uuid REFERENCES customer_profiles(id) ON DELETE SET NULL,
  amount integer,                        -- cents; null = full refund
  reason text NOT NULL,
  status text NOT NULL,                  -- pending | approved | rejected | refunded
  staff_response text,                   -- approval/rejection note
  approved_by text,                      -- staff member id
  approved_at timestamp,
  refund_id text,                        -- stripe re_/pyr_ id once issued
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX refund_requests_appointment_idx ON refund_requests (appointment_id);
CREATE INDEX refund_requests_status_idx ON refund_requests (status);
```

**Control-panel DB:** no new tables (Subscriptions data lives on tenant side
via existing `appointments` / new `memberships` table if D.1 needs one;
re-evaluate during D.1 implementation).

## ADRs to author during implementation

- **ADR-0022 — Stripe Subscriptions on Connect for memberships.** Why
  Stripe-native over DIY chargeSavedCard cron; how renewal events flow;
  how to handle SaaS tier app fee on subscription invoices.
- **ADR-0023 — Magic-link customer portal.** Token shape, expiry, revocation,
  action audit trail; why no customer login.
- **ADR-0024 — Refund request workflow.** Customer→staff handoff; auto-approve
  rules vs always-approve; communication cadence.
- **ADR-0025 — Pre-authorize holds.** When to capture vs void; what happens
  on no-show vs cancel; refund vs void distinction.
- **ADR-0026 — In-app SCA challenge UX.** When to surface 3DS; what to do
  if customer abandons mid-challenge; off-session → on-session escalation.

## Wrangler config changes

```jsonc
"triggers": {
  "crons": [
    "0 * * * *",         // existing C.1
    "30 2 * * *",        // existing C.5
    "0 9 * * *",         // existing C.6
    "0 4 * * *"          // NEW D.9 pending-package sweeper at 04:00 UTC
  ]
}
```

## Recommended commit sequence

1. `feat(plan-d): magic-link customer portal foundation (D.3 + ADR-0023)`
2. `feat(plan-d): customer refund-request flow (D.4 + ADR-0024)`
3. `feat(plan-d): partial refunds (D.6)`
4. `feat(plan-d): in-app SCA challenge UX (D.5 + ADR-0026)`
5. `feat(plan-d): card-update flow (D.7)`
6. `feat(plan-d): multi-method card storage (D.8)`
7. `feat(plan-d): pre-authorize holds (D.2 + ADR-0025)`
8. `feat(plan-d): Stripe Subscriptions on Connect for memberships (D.1 + ADR-0022)` ← biggest, last
9. `feat(plan-d): pending-package cleanup sweeper (D.9)`
10. `docs(plan-d): runbook update + final ADR consolidation`

D.3/D.4/D.6/D.5/D.7/D.8 in this order build the customer-portal surface
incrementally. D.2 + D.1 are bigger isolated efforts that don't depend on
the portal but benefit if it ships first (deadline reminders for pre-auth
holds, billing-portal handoff for subscriptions).

## What's NOT in Plan D

Explicitly deferred to **Plan E or beyond**:

- Multi-currency at customer level (charge a SGD customer on a MY acct via Stripe FX)
- Gift cards / store credit ledger
- Tipping at checkout
- Group billing (one customer pays for multiple appointment slots)
- Affiliate / referral payouts
- Tax automation (LHDN MyInvois integration — currently we have `e_invoice_status` columns but no automation)
- Loyalty / points-as-discount at checkout
- Multi-method card storage UI (D.8 ships the data model only; full UI is Plan E)
- Cross-tenant customer identity (a customer goes to 2 franchises — separate Stripe Customers today, by design)

## When to start

Plan D is product-launch-time work. Recommend starting when:
- Plan B is merged to `main`
- Plan C has been live for at least 2 weeks (real drift patterns observed → may inform Plan C v2 auto-fix that affects D)
- Product PRD exists for at least D.1 + D.3 (member experience varies a lot by gym; need a concrete tenant signed up to validate the design)

Until then, Plan D is scoped and ready.

## Open questions for /grill-me before kickoff

1. **Membership engine** — Stripe Subscriptions vs DIY cron. Trade-offs in
   tax/invoice numbering across tenants? Stripe-hosted invoice URLs vs our
   own? Customer billing portal scope?
2. **Customer auth** — Magic-link forever, or do we ship full email/password
   for customers at some point? If yes, when?
3. **Refund auto-approve** — Should some refund requests auto-approve (e.g.
   refunds within 24h of charge for amount < $X)?
4. **Pre-auth hold timing** — When does the hold cancel? Tenant policy?
   Customer-facing policy display?
5. **SCA on subscriptions** — Stripe handles in their hosted invoice email
   today; do we need to mirror that experience in our customer portal?
6. **Multi-currency** — Is Plan D MY-only, or do we open SGD/THB at customer
   level? Affects D.1 Subscriptions scope significantly.
