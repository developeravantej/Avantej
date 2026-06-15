# ADR 0006 — Webhook Architecture and Idempotency

Date: 2026-05-13
Status: Accepted

## Context

Webhooks are the canonical source of truth for state changes initiated outside our server (payment success, account onboarding completion, refund, dispute, subscription renewal). Webhook handling failures or duplicate processing cause silent data corruption.

The system handles two event streams: platform events (SaaS Billing on the Avantej platform account) and Connect events (Customer→Tenant transactions on each connected account). Each can be registered to a different URL with a different signing secret.

## Decision

**Endpoint topology:** Split endpoints.
- `POST /webhooks/stripe/platform` — receives Billing and platform-level events. Secret: `STRIPE_PLATFORM_WEBHOOK_SECRET`.
- `POST /webhooks/stripe/connect` — receives all Connect events from all connected accounts. Secret: `STRIPE_CONNECT_WEBHOOK_SECRET`.

**Idempotency:** Hybrid (dedupe table primary, natural keys as defense).

Add `processed_webhook_events` table in the control-panel DB:

```
processed_webhook_events (
  event_id        text pk           -- evt_xxx (Stripe-assigned, globally unique)
  event_type      text not null
  source          text not null     -- 'platform' | 'connect'
  stripe_account  text              -- acct_xxx for connect events, null otherwise
  received_at     timestamptz not null default now()
  processed_at    timestamptz       -- null until handler succeeds
  attempts        integer not null default 1
  error           text
)
```

Handler flow per request:
1. Verify signature with the endpoint's secret.
2. Insert into `processed_webhook_events` with `ON CONFLICT (event_id) DO UPDATE SET attempts = attempts + 1 RETURNING processed_at`.
3. If `processed_at IS NOT NULL`, return 200 immediately (event already handled).
4. Dispatch to handler keyed by `event.type`.
5. On success, set `processed_at = now()` and return 200.
6. On failure, write `error` and return 500 so Stripe retries.

Business tables enforce additional natural-key uniqueness as defense in depth (e.g. `package_instances.stripe_payment_intent_id` unique).

**Connect account resolution:** `organizations.stripe_connect_account_id` is unique-indexed in the control-panel DB. Each Connect handler resolves the row at the top of processing, derives `organizationId`, and opens the Tenant DB connection. Unmapped accounts are logged, the event is marked processed with an `error`, and the response is 200 (do not retry an unrecoverable mapping failure).

**Processing model:** Synchronous in v1. Cloudflare Workers latency budget allows handlers up to a few seconds. If profiling shows a handler approaching 5 seconds, refactor that specific path to ack-then-queue.

## Consequences

Positive:
- Independent rotation/revocation of platform vs connect signing secrets.
- Dedupe table provides cross-cutting safety regardless of handler bugs and a forensic audit trail of every event Stripe delivered.
- Natural-key uniqueness in business tables catches handler logic errors that bypass the dedupe table.
- Split endpoints match `stripe listen --forward-to` and `--forward-connect-to` 1:1 — no surprise behavior between dev and prod.

Negative:
- One extra DB write per webhook (acceptable; cheap compared to handler work).
- Routes file slightly larger (two handlers instead of one switch).
- Synchronous handling means heavy work in a handler can spike webhook latency; mitigated by lightweight v1 handlers and per-handler refactor if needed.

## Alternatives considered

- **Single endpoint with internal switch on `event.account`.** Rejected because it forces one shared signing secret and complicates dev parity with the Stripe CLI flag split.
- **Pure natural-key idempotency.** Rejected because some events (e.g. `customer.subscription.updated`) have no clean "did we already apply this exact change" key.
- **Async queue from day one.** Rejected as premature; v1 handlers are simple and the failure mode (delayed processing) is harder to reason about than synchronous + dedupe.
