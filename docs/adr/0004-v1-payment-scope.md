# ADR 0004 — v1 Payment Scope

Date: 2026-05-13
Status: Accepted

## Context

The full payment system spans seven phases (SaaS sub, Connect onboarding, one-time customer payments, recurring memberships on Connect, trainer split, audit ledger, hardening). Shipping all phases at once delays first pilot and increases scope risk. A focused v1 cut keeps revenue-critical paths intact while deferring complexity that pilots can live without.

## Decision

**v1 (required for first pilot):**
- Phase 0 — Stripe sandbox setup, seed scripts, MCP automation.
- Phase 1 — SaaS Subscription via Stripe Billing (Tenant → Avantej, platform account, Stripe Checkout).
- Phase 2 — Connect onboarding (Express accounts for Tenants only; trainer accounts deferred).
- Phase 3 — One-time package purchase (Customer → Tenant) via PaymentIntent + Stripe PaymentSheet (RN SDK), Direct charges on the Tenant's connected account with 2% application fee.
- Phase 6-lite — Mirror `payments` writes into a control-panel `platform_payment_ledger` table for cross-tenant audit (no admin UI yet; SQL-only access).
- Phase 7 — Webhook idempotency dedupe table + nightly reconciliation job.

**v2 (post-pilot):**
- Phase 4 — Recurring memberships (Stripe Billing on connected accounts).
- Phase 5 — Trainer split via Stripe transfers (trainer payouts handled off-platform manually in v1).
- Phase 6-full — Admin audit dashboard UI.

**Explicit non-goals in v1:**
- Multi-currency (USD only, or single launch currency).
- Refund initiation from Avantej UI (Tenants use Stripe Express dashboard).
- Dispute UI (Stripe Express dashboard).
- Stripe Tax (Tenant self-manages tax for v1).

## Consequences

Positive:
- ~3.5 dev-weeks to first pilot (one engineer) vs ~5-6 weeks for full scope.
- Smallest revenue-complete loop: Avantej collects SaaS, Tenant collects from Customers, Avantej collects application fee.
- Lower Stripe Connect platform review risk (no trainer multi-party split yet).
- v1 surface area = small enough to keep tested end-to-end.

Negative:
- Pilot tenants who depend on memberships must wait or run them off-platform in v1.
- Trainer-heavy tenants must pay trainers manually in v1.
- Audit visibility requires SQL access in v1.
- Refund flow forces Tenants into Stripe dashboard, breaking the otherwise-unified Avantej UX.

## Alternatives considered

- **Full scope v1** — Rejected due to timeline and risk surface.
- **v1 + memberships only** — Possible if first pilots demand recurring. Re-evaluate per pilot contract.
- **v1 + trainer split only** — Possible if pilots are PT studios. Defer until contract demands it.
