# ADR 0021 — Cloudflare Workers Cron as Scheduled-Job Infrastructure

Date: 2026-05-16
Status: Accepted

## Context

Plan C ships three scheduled jobs:
- **C.1 webhook backfill** — hourly, ~5min wall clock
- **C.5 nightly reconciliation** — daily, can run multiple minutes at scale
- **C.6 onboarding-stuck alert** — daily, seconds

We need a scheduling mechanism with:
- Reliable delivery (cron fires on time, doesn't silently drop)
- Same env vars + DB pools as our request handlers (no separate deploy)
- Local-dev support (so we can `wrangler dev --test-scheduled` to trigger crons manually)
- Observability (logs in the same place as our request handler logs)
- Single source of truth for the schedule (no risk of code/external-config drift)

Three candidate platforms:

1. **Cloudflare Workers Cron Triggers** — declared in `wrangler.jsonc`,
   invoke a `scheduled` export on the same Worker.

2. **External cron** (GitHub Actions, Vercel Cron, EasyCron) hitting an
   oRPC endpoint via authenticated HTTP.

3. **Durable Object alarms** — DO holds state + `setAlarm()` per tenant.

## Decision

Use **CF Cron Triggers + a scheduled handler that dispatches to oRPC
service functions** (option 1, hybrid pattern).

The `scheduled` export reads `event.cron` and `await import`s the matching
service module (lazy import to keep cold-start cost off the `fetch` path).
Work runs inside `ctx.waitUntil(...)` so the scheduled handler returns
quickly while the actual job continues in the background up to the Worker
CPU budget.

```ts
// apps/server/src/index.ts
export default {
  fetch: app.fetch,
  scheduled: async (event, _env, ctx) => {
    if (event.cron === "0 * * * *") {
      const { runWebhookBackfill } = await import("@/services/webhook-backfill.service");
      ctx.waitUntil(runWebhookBackfill({ ... }));
    } else if (event.cron === "30 2 * * *") {
      // reconciliation
    } else if (event.cron === "0 9 * * *") {
      // onboarding-stuck alert
    }
  },
};
```

```jsonc
// apps/server/wrangler.jsonc
"triggers": {
  "crons": [
    "0 * * * *",      // C.1
    "30 2 * * *",     // C.5
    "0 9 * * *"       // C.6
  ]
}
```

Manual triggers (admin UI "Run reconciliation now") call the **same
service function** directly from an oRPC handler. Cron path = button path
= identical code, zero divergence risk.

## Consequences

Positive:
- Schedule declared in source, deployed atomically with code. No drift
  between schedule and implementation.
- Same env vars, secrets, DB pools, and logging as request handlers. No
  separate auth model.
- Local-dev story: `wrangler dev --test-scheduled` + curl-trigger one cron
  for testing.
- Same code runs from cron AND from the admin "Run now" button —
  observability + manual override are one path.
- Cost-effective: CF cron is free up to ~1000 invocations/day. Our cadence
  is ~26/day.

Negative:
- Cloudflare Workers CPU + wall-clock limits apply (30s CPU on the paid
  plan, plus `ctx.waitUntil` continues running past the scheduled handler
  return). Reconciliation at high scale could exceed it — mitigation is
  per-acct pagination + a "resume from last_reconciled_at" pattern (already
  baked into `reconciliation_state`).
- Cron-only environments (no global state between fires) — we hold all
  state in DB tables, not in-memory.
- Single-region Worker firing — if we ever go multi-region or multi-account
  for production, we'd need to ensure the cron triggers in exactly one
  region.

## Alternatives considered

- **External cron (option 2)** — rejected: adds a separate deploy
  dependency, requires service-key auth (or rotating secrets) to hit our
  oRPC endpoint, and the schedule lives in a different config file than
  the code.
- **Durable Object alarms (option 3)** — rejected for v1: a DO is the right
  shape for *per-tenant* scheduled work (per-tenant dunning, per-tenant
  retry queues). Plan C's crons are *platform-scoped* — one DO per cron
  is the wrong shape, and we'd lose the same-Worker-as-fetch benefit.
  Will revisit if/when we add per-tenant scheduled work in a future plan.

## Related

- ADR-0019 — Reconciliation policy (what the C.5 cron does).
- ADR-0006 — Webhook architecture (the source-of-truth path; cron is
  the recovery path).
- ADR-0018 — platform_payment_ledger (writes from both webhook handlers
  AND C.1 backfill cron).
