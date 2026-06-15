# ADR 0014 — Refund Stripe Account via Snapshot, Not Resolver

Date: 2026-05-15
Status: Accepted

## Context

Refunding a Stripe charge requires `stripe.refunds.create(...)` to be called against the **same Connect account** that received the charge. Stripe rejects cross-account refund attempts.

Phase 4 introduced per-country Connect accounts: each org can have one Stripe account per country (MY/SG/TH/...). The country-aware helper `getConnectAccountForOrgCountry(orgId, countryCode, db)` resolves the appropriate acct at charge time based on the appointment's branch country.

Risk: if a tenant restructures (moves a branch between country nodes, or onboards a new acct for a country) between charge and refund, calling the resolver at refund time would yield a *different* acct than the one that processed the original charge. Stripe rejects the refund. Operational nightmare.

## Decision

When creating a payment row (PaymentIntent, Payment Link, or POS sale), **snapshot the Stripe Connect account id on the row** (`stripe_connect_account_id_snapshot` column). At refund time, **use the snapshot, never the resolver**.

Schema columns added:
- `appointments.stripe_connect_account_id_snapshot` (Phase 2)
- `payments.stripe_connect_account_id_snapshot` (Phase 3c.1)
- `customer_profiles.stripe_connect_account_id_snapshot` (Phase 3d, for saved-card customers)

Refund code path (apps/server/src/routers/payments.ts → `refund` procedure):
- Read `appt.stripeConnectAccountIdSnapshot` — throw PRECONDITION_FAILED if null (charge was issued before snapshot column existed; manual refund via Stripe Dashboard).
- Call `stripe.refunds.create({ payment_intent, refund_application_fee: true, reverse_transfer: false }, { stripeAccount: snapshot, idempotencyKey: \`refund:appt:\${id}\` })`.
- DO NOT call `getConnectAccountForOrgCountry` here. The country resolver's only purpose at refund time is to compute the application_fee_amount % — but Stripe handles fee reversal automatically via `refund_application_fee: true`, so no fee% calc is needed for refunds.

Same pattern applies to:
- **Saved-card charges** — saved PaymentMethods live on the Customer's snapshot acct; charging them via a different acct would 404 the PM. `chargeSavedCard` prefers the customer's snapshot for `stripeAccount` even when the country resolver could pick differently.

## Consequences

Positive:
- Refunds are guaranteed to hit the correct acct, even after tenant restructuring or branch-country reassignment.
- Historical reconciliation across the per-country migration (Phase 4) is preserved — old appointments still know which acct charged them.
- Saved-card charges are robust to country resolver disagreement.

Negative:
- Snapshot columns grow with every payment-tracking schema. The pattern must be remembered on every new payment-related table.
- Snapshot can drift from reality if Stripe rotates account ids (extremely rare — Stripe doesn't do this in practice, but documented as a theoretical risk).

## Alternatives considered

- **Re-resolve at refund time via country resolver** — rejected for the race above.
- **Store only PaymentIntent id, look up its acct via Stripe API on refund** — adds a Stripe API call per refund and a network failure point. The snapshot is cheaper and faster.
