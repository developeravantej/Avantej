# ADR 0037 — Snapshot Factor Expansion (Wire All 5 Health-Score Inputs)

Date: 2026-05-17
Status: Accepted
Closes: ADR-0030 open follow-up

## Context

ADR-0030 (Plan F.1.5) defined a 5-factor health-score formula but
launched with only 2 inputs live (`payment_status` +
`last_successful_payment_at`). The other 3 factors —
`last_admin_login_at`, `failed_webhooks_7d`,
`daily_active_members_30d_avg` — emitted `no_data` info flags because
their snapshot columns didn't exist.

This ADR closes that gap with migration 0030 + service-layer wiring.

## Decision

Three new columns on `tenant_usage_snapshots` (additive ALTER, nullable,
no backfill):

```sql
ALTER TABLE tenant_usage_snapshots
  ADD COLUMN IF NOT EXISTS last_admin_login_at timestamp,
  ADD COLUMN IF NOT EXISTS failed_webhooks_7d integer,
  ADD COLUMN IF NOT EXISTS daily_active_members_30d_avg integer;
```

The daily snapshot cron (`tenant-usage-snapshot.service.ts`) populates
all 3 before calling `computeHealthScore`. Per-factor approach:

### `lastAdminLoginAt` — LIVE
```sql
SELECT MAX(user.last_login_at)
FROM user
JOIN organization_members ON organization_members.user_id = user.id
WHERE organization_members.organization_id = $orgId
  AND organization_members.role = 'admin'
```

Works immediately via Better-Auth's session writes to `user.last_login_at`.
Tolerant: null result if no admin found.

### `failedWebhooks7d` — GLOBAL (per-org pending)
```sql
SELECT COUNT(*) FROM processed_webhook_events
WHERE source = 'stripe'
  AND processed_at >= now() - interval '7 days'
  AND attempts > 1
  AND error IS NOT NULL
```

**Caveat**: this is a GLOBAL count, not per-org. Every org sees the same
number. This is intentional for v1 — `processed_webhook_events` doesn't
carry an `organizationId` column today. Adding one requires a separate
migration + backfill of the webhook handler that writes the table.
Tracked as ADR-0037 open follow-up.

Until per-org attribution lands, the factor still discriminates between
"global webhooks are healthy" vs "global webhooks are failing" — a
useful aggregate signal even if not org-specific.

### `dailyActiveMembers30dAvg` — DEFERRED
Currently writes `null`. Reason: tenant `members` schema has no
`last_active_at` column. Adding one is a tenant-DB migration touching
every Neon branch — substantial work outside F.6 scope.

The factor emits `no_data` flag for this dimension only; the other 4
factors still score the org. Tracked as ADR-0037 open follow-up
"Tenant activity tracking".

## Consequences

- 3 new nullable columns on snapshot table; historical rows stay null
  (per ADR-0030 no-backfill principle).
- Health score now includes 4 of 5 factors live (subscription, payment
  recency, login recency, webhooks). Activity factor remains `no_data`
  pending tenant activity tracking.
- `inactive_admin` + `webhook_failures` risk flags now fire when
  conditions are met (Plan F.6 e2e seeds verify this).
- `computeHealthScore` interface unchanged — F.1.5 already declared the
  3 fields as optional inputs.
- Tenant DB tolerant open via `tryOpenTenantDb` (per ADR-0036) — if
  tenant DB is unreachable when computing activity factor, snapshot
  still writes successfully with the activity factor null'd out.

## Alternatives considered

- **Add `organizationId` to `processed_webhook_events`** for proper
  per-org webhook attribution. Rejected for F.6 — substantial work
  (migration + webhook handler update + 7-day historical backfill or
  global-count fallback during transition). Global count is fine for
  v1; revisit if ops asks for "show me orgs with worst webhook
  health".
- **Add `last_active_at` to tenant `members` table.** Rejected for
  F.6 — touches every tenant Neon branch (~tens of branches today,
  more soon). Tenant migration story is a separate ADR. Defer until
  the tenant migration pipeline is solid.
- **Use Better-Auth session table directly for activity**. Considered.
  Per-tenant session log requires tenant DB open + cross-tenant
  iteration. Same blocker as members.last_active_at — defer.
- **Drop the activity factor from the formula.** Rejected — it's a
  real signal of product engagement. Leaving as `no_data` until input
  lands preserves the design intent and lets the formula auto-pick-up
  when ready.

## Open follow-ups

- **Per-org webhook attribution** — add `organization_id` column on
  `processed_webhook_events`. Migration + webhook handler patch. Open
  when ops asks "which orgs have worst webhook health?".
- **Tenant activity tracking** — add `last_active_at` to tenant
  `members` schema. Tenant migration pipeline ADR needed first.
- **Snapshot service test coverage** — F.6 unit tests are
  shape-focused; add full IO mocks if regressions appear.
