# ADR 0023 — Tenant Usage Snapshots

Date: 2026-05-16
Status: Accepted

## Context

Plan E E.2 needs a cross-tenant view of "how much is each tenant using
the platform" — members, customers, appointments, sales — both for the
admin overview KPI strip and the per-tenant drill-in usage trend.

The source of truth lives in each tenant's Neon database. Fanning out
at request time is infeasible:

- N tenant DBs × M concurrent admin viewers = quadratic connection
  pressure on Neon. Each admin page load would open one pool per tenant.
- Trend charts need *historical* values; live counts don't tell you whether
  Tenant X grew or shrunk last week.
- Worker CPU budgets (30s on paid plan) cap how many tenant DBs we can
  query in series within a single request.

Three candidate shapes:

1. **Daily snapshot rollup** — cron writes one row per (org, day) to
   the control panel; admin UI reads from the control panel only.
2. **Realtime streaming** — every business event (member created,
   appointment booked) fires a counter increment into a control-panel
   table.
3. **On-demand fan-out with TTL cache** — admin request triggers a
   tenant-DB scan, cached in KV for ~5min.

## Decision

Use option 1 — **daily cron at 01:00 UTC writes `tenant_usage_snapshots`
with bounded concurrency (=5) cross-DB fan-out**.

Counters captured per tenant per day:

| Field | Source | Notes |
|-------|--------|-------|
| `member_count` | tenant `members` row count | current snapshot |
| `customer_count` | tenant `customer_profiles` row count | current snapshot |
| `appt_count_30d` | tenant `appointments` where created_at > now-30d | trailing window |
| `sales_total_30d_minor` | tenant `payments` where status=succeeded, last 30d | trailing window |
| `sales_currency` | min(payments.currency) — first observed | tenants are single-currency in practice |
| `storage_bytes` | 0 (deferred) | needs `pg_database_size` privilege; will revisit |
| `ghl_active` | `organizations.ghl_provisioned_at IS NOT NULL` | control-panel only — no tenant DB hit |

UPSERT on `(organization_id, snapshot_date)` so re-runs (e.g. manual
refresh from drill-in UI, or backfill if cron misses) are idempotent.

Concurrency bounded at 5 — at 100 tenants × 1 pool each = 500 idle
connections is already a Neon-tier concern; running them serially is
~100 × (4 queries × ~100ms) = 40s, which fits the Worker waitUntil
budget after the scheduled handler returns.

Manual trigger procedure (`runTenantUsageSnapshotsNow`) lives on the
same admin router so the cron and the "Refresh now" button hit one
codepath.

## Consequences

Positive:

- Admin UI is a single control-panel read regardless of tenant count —
  scales to thousands of tenants without touching tenant DBs at request
  time.
- Trend chart is intrinsic: 30 rows of history per org = 30-day chart.
- Idempotent re-runs make recovery from a missed cron trivial — just
  call the proc.
- Bounded concurrency keeps Neon connection pressure flat regardless
  of fleet size.

Negative:

- **Up-to-24h staleness.** Member count from yesterday's snapshot. For
  Avantej ops, this is fine (usage is not a paging metric); when fresh
  numbers are needed, the manual "Refresh now" button covers it.
- **storage_bytes deferred.** `pg_database_size` requires owner or
  superuser. The Neon-issued connection role is neither. Will revisit
  with either Neon project-level API or a separate maintenance role.
- One snapshot per day per tenant = 365 rows/year/tenant. At 1000
  tenants that's 365k rows/year — well within Postgres comfort, but
  worth knowing.
- Snapshot cron failure is invisible until someone notices the trend
  flat-lined. Future improvement: emit a structured log line that the
  observability dashboard alerts on.

## Alternatives considered

- **Realtime streaming (option 2).** Rejected — adds a hot-path side
  effect to every business write (member create, appt book), which is
  a new coupling between domain logic and ops infrastructure. The win
  (sub-day freshness) doesn't justify the cost for an internal admin
  view. Reconsider if/when we surface usage to *tenants* (where stale
  numbers might confuse a customer).
- **On-demand fan-out with KV cache (option 3).** Rejected — first
  uncached request still pays the fan-out cost; KV adds a second
  consistency surface; doesn't give us history (would need pairing with
  snapshots anyway, so just do snapshots).
- **Snapshot every N hours instead of daily.** Considered. Daily is the
  smallest meaningful trend unit for tenant usage; hourly multiplies
  rows 24× for no business signal. Manual "Refresh now" covers the
  occasional "we need numbers now" case.

## Related

- ADR-0021 — CF Cron infrastructure (the scheduling backbone).
- ADR-0014 — Snapshot-on-write pattern (different concern but same
  philosophy: precompute reads).
- ADR-0019 — Reconciliation policy (the same cross-DB fan-out pattern;
  E.2 follows its concurrency-bounded shape).
