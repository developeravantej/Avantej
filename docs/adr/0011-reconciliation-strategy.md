# ADR 0011 — Reconciliation Strategy: Nightly Cron with Handler Replay

Date: 2026-05-13
Status: Accepted

## Context

Webhooks are best-effort. Stripe guarantees at-least-once delivery for ~3 days; after that, missed events are gone. Causes of misses include deploy windows, transient handler bugs, third-party outages, and signature-verification failures from key rotation accidents. Without an out-of-band check, the DB silently diverges from Stripe — corrupted ledgers, missing `package_instances` for paid Customers, wrong revenue totals.

## Decision

Adopt a hybrid model: webhooks remain primary; a nightly reconciliation job is the safety net.

**Cadence:** Cloudflare Cron Trigger fires daily at 03:00 UTC.

**Scope per run:**
- Platform `Subscription` list with `created.gte = now - 48h` (and `status` drift check independent of window for known subs).
- Per-tenant `PaymentIntent.list` (under `Stripe-Account: acctId` for each Tenant with a connected account) with `created.gte = now - 48h`, expanding `latest_charge.refunds`.
- Per-tenant `Account.retrieve` to refresh `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`, `stripeConnectStatus`.

**Repair mechanism:** Reconciler calls the same handler functions the webhook routes use, passing the Stripe-fetched object directly. Webhook signature verification is bypassed because the object came from a direct API fetch using the Avantej platform secret. The `processed_webhook_events.source` column distinguishes `'reconciler'` from `'platform'` / `'connect'` for audit.

**Out-of-window drift** (older than 48h) is detected via monthly Stripe statement reconciliation handled by finance ops, not by this job.

**Manual run:** An admin-tool oRPC procedure `admin.reconcileNow({ from, to, scope })` lets ops trigger ad-hoc reconciliation with explicit time and scope filters.

**Alerting v1:** Log a structured summary per run (`piChecked`, `piRepaired`, `subChecked`, `subRepaired`, `errors[]`). Manual nightly review until Slack/email alerting is added.

## Consequences

Positive:
- Self-healing for the most common failure modes (deploy gaps, transient bugs).
- Same code path for webhook and reconciler — one set of bugs, one set of tests.
- `processed_webhook_events.source` gives a clear audit trail of which rows came from which path.
- Cloudflare Cron is in-stack, free, and runs in the same env as the server.

Negative:
- Per-tenant `PaymentIntent.list` fans out linearly with Tenant count. At small-medium scale this is fine; once tenants number in the hundreds, the nightly run length will grow and we'll need a queue-based per-tenant fan-out.
- 48h window means drift older than 48h is detectable only via Stripe statements (manual). Acceptable given Stripe's own 3-day delivery guarantee.
- No automated alerting in v1 — depends on someone reading logs.

## Alternatives considered

- **Pull-only periodic sync (no webhook reliance)** — Higher API call volume, lower freshness. Rejected; webhooks are too valuable to discard.
- **On-demand reconcile only** — Issues stay invisible until someone notices. Rejected.
- **Reconcile via direct DB writes (bypass handlers)** — Two code paths, double the test surface, drift between webhook logic and reconcile logic. Rejected.
- **Hourly reconcile** — Higher API cost without meaningful freshness improvement vs nightly given Stripe's own retry behavior. Rejected for v1.
