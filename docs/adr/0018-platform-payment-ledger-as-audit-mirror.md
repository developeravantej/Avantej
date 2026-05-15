# ADR 0018 — Platform Payment Ledger as Audit Mirror

Date: 2026-05-16
Status: Accepted

## Context

Plan B (Stripe Connect) routes per-tenant charges through tenant-owned
connected accounts. Application fees flow back to the Avantej platform on
each PaymentIntent. Plan A SaaS subscriptions invoice tenants on the platform
account directly.

Avantej as a business needs:
- Cross-tenant revenue accounting (how much application fee did we collect this month?)
- Audit trail decoupled from Stripe's API rate limits (we can't `stripe.applicationFees.list` on every admin dashboard load)
- A reference point for the C.5 nightly reconciler — without an in-app view of "what Stripe told us happened," reconciliation has nothing to diff against
- An SaaS Layer 1 + Connect Layer 2 unified view (one timeline of every dollar that touched our platform)

Three candidate designs:

1. **Query Stripe live every time.** No table, no writes. Admin UI calls `stripe.applicationFees.list` per request. Rate-limited at scale, slow, breaks on Stripe outage.
2. **Per-tenant rows in the tenant DB.** Each tenant's revenue lives in their own DB. Cross-tenant aggregation requires fan-out queries to N tenant DBs — fundamentally not workable for platform-admin views.
3. **Centralized control-panel ledger table.** Single source of in-app truth for both Layer 1 and Layer 2 events. Stripe remains the system of record (per ADR-0011) — this is a read-optimized mirror.

The `platform_payment_ledger` schema was created in Plan A (commit history shows the schema file with the comment "Plan A creates the table only; the writes land in Plan D"). The intent was always option 3; Plan C C.7 is the wiring.

## Decision

Use the existing `platform_payment_ledger` control-panel table as a write-only
audit mirror, idempotent on `stripe_event_id`. Writes happen from the webhook
handlers (real-time) and the C.1 backfill cron (recovery for missed events).

Event-kind taxonomy:
- `pi_succeeded`              — Connect-side `payment_intent.succeeded`
- `pi_refunded`               — Connect-side `charge.refunded`
- `saas_invoice_paid`         — Platform-side `invoice.paid`
- `application_fee_collected` — Connect-side `application_fee.created`

Schema fields used:
- `stripe_event_id` (UNIQUE) — dedupe key. Webhook replays + backfill cron MUST NOT duplicate.
- `organization_id` — nullable. Null for platform-level events (SaaS invoice paid). Resolved via metadata or `org_country_stripe_accounts` lookup for Connect events.
- `event_kind` — enum string per taxonomy above.
- `stripe_object_id` — `pi_...`, `in_...`, `ch_...`, `fee_...`.
- `stripe_account` — `acct_...` for Connect events, null for platform.
- `amount`, `application_fee`, `currency` — minor units, ISO 4217 lowercase.
- `occurred_at` — `event.created` (Stripe time, NOT our DB clock).

Writes use `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING` and log on
conflict so replay activity is observable.

## Consequences

Positive:
- Admin UI reads are O(1) queries against an indexed local table, not Stripe API calls.
- C.5 reconciler has a clear diff target (Stripe truth vs ledger).
- Stripe outages don't kill the admin UI (we cached our last-known truth).
- Stripe API version changes can break events in flight, but rows we already persisted are immutable in our ledger — they won't change shape mid-flight.

Negative:
- Drift between ledger and Stripe is now possible (mitigated by C.5).
- The ledger doesn't capture every field of every event — it's a thin projection. Anyone needing the full event needs Stripe.
- Adding new event kinds requires a schema migration (just adding to the enum string column; the column is `text`, so no DB migration needed for adding kinds — but callers/UI must agree).

## Alternatives considered

- **Option 1 (live Stripe queries)** — rejected for the reasons above.
- **Option 2 (per-tenant rows)** — rejected because cross-tenant aggregation is the primary platform-admin use case.
- **Event-sourcing the entire Stripe payload as JSONB** — considered, but the use cases (revenue audit, drift detection) want columnar aggregation, not blob storage. The thin projection wins.

## Related

- ADR-0011 — Reconciliation strategy (Stripe is source of truth).
- ADR-0019 — Reconciliation policy (uses this ledger as the diff target).
- ADR-0006 — Webhook architecture (dedupe via `processed_webhook_events`).
