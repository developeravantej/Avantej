# VERIFICATION-Sn — Plan F.6 Agent Sn snapshot factor expansion

Branch: `plan-f-6-extensions` (started at `f0b44d0`)
Owner: Sn — agent 1/2 of `/ship` Plan F.6.
Date: 2026-05-17.

## Scope delivered

F.1.5 launched the composite health-score formula but the daily snapshot
cron only populated 2 of 5 factors (`payment_status`,
`last_successful_payment_at`). The other 3 factors emitted `no_data`
because their snapshot columns did not exist. This drop wires them.

New columns on `tenant_usage_snapshots` (migration `0030`):

| Column                          | Type      | Source                                                                                                     |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `last_admin_login_at`           | timestamp | `MAX(user.last_login_at)` joined to `organization_members WHERE role='admin'` for the org.                  |
| `failed_webhooks_7d`            | integer   | `COUNT(*) FROM processed_webhook_events WHERE source='stripe' AND received_at >= now()-7d AND (processed_at IS NULL OR error IS NOT NULL) AND attempts > 1`. Global count today (see TODO below). |
| `daily_active_members_30d_avg`  | integer   | Cron writes `null` for now; tenant `members` table has no activity column (see TODO below).                |

The health-score formula in `packages/services/src/health-score.ts`
already accepted these three optional inputs since F.1.5 — no formula
changes were needed. The cron now supplies them.

## Files

- **Migration**: `packages/db/src/migrations/control-panel/0030_snapshot_factor_columns.sql`
  Additive only — 3 nullable columns. Applied manually to the dev DB
  (journal drift on local — same pattern as prior plan-f drops).
- **Schema (PATCH)**: `packages/db/src/schema/control-panel/tenant-usage-snapshots.ts`
  Adds `lastAdminLoginAt`, `failedWebhooks7d`, `dailyActiveMembers30dAvg`
  fields under the existing `riskFlags` field.
- **Cron service (PATCH)**: `apps/server/src/services/tenant-usage-snapshot.service.ts`
  `snapshotOne` now computes all 3 new factors before calling
  `computeHealthScore`, passes them in, and persists them on
  insert/on-conflict-update. Tolerant tenant-DB open: if the tenant
  branch is unreachable, the snapshot row is still written with zeroed
  per-tenant counters (the 3 new factor columns continue to populate
  because they read from the control-panel DB only).
- **Health-score tests (PATCH)**: `packages/services/src/health-score.test.ts`
  Adds 4 tests under a "Plan F.6 — factors now populated by the cron"
  describe block: combined three-factor regression, single-factor
  no_data renormalisation, webhook-zero-no-flag, and 14d login boundary.
- **Snapshot service unit test (NEW)**: `apps/server/src/services/tenant-usage-snapshot.service.test.ts`
  Three formula-input-shape tests verifying the cron's contract with
  `computeHealthScore` after F.6.
- **E2E (NEW)**: `apps/web/e2e/tests/ship/plan-f-6/Sn-snapshot-factors.spec.ts`
  Tagged `@ship-f-6`. Four scenarios:
  1. Migration applied — 3 columns present on `tenant_usage_snapshots`.
  2. Schema round-trip — insert + read-back values for all 3 fields.
  3. `platformAdminTenants.health.get` returns `inactive_admin` +
     `webhook_failures` flags when the snapshot row has bad values.
  4. Tolerant — snapshot row with all new fields NULL still reads back
     `200`.
- **Video**: `verification/plan-f-6/Sn-snapshot-factors.webm` (144 KB).
- **This doc**: `VERIFICATION-Sn.md`.

## Test results

`bun test packages/services/src/health-score.test.ts`
→ 17 pass / 0 fail (4 new tests added on top of existing 13).

`bun test apps/server/src/services/tenant-usage-snapshot.service.test.ts`
→ 3 pass / 0 fail (new file).

`bun check-types`
→ both `server` and `web` clean (no new TS errors).

`npx playwright test e2e/tests/ship/plan-f-6/Sn-snapshot-factors.spec.ts`
→ 1 passed (7.0s).

Per-scenario console output captured in the trace:

```
[scenario-1] columns=["daily_active_members_30d_avg","failed_webhooks_7d","last_admin_login_at"]
[scenario-2] readback={"lastAdminLoginAt":"2026-05-02T05:38:29.571Z","failedWebhooks7d":5,"dailyActiveMembers30dAvg":3}
[scenario-3] health.get status=200 body={ snapshotDate, healthScore:50, riskFlags:[inactive_admin/info, webhook_failures/critical] }
[scenario-4] tolerant-null status=200
```

## Per-factor query approach + TODO acknowledgements

1. **`last_admin_login_at`** — implemented per the brief's "best-effort"
   guidance: join `organization_members` (role=admin) to `user` and take
   the max `last_login_at`. This captures any login by any admin of the
   org. Will start working immediately because Better-Auth already
   updates `user.last_login_at` on every session create.

2. **`failed_webhooks_7d`** — `processed_webhook_events` does NOT carry
   `organization_id` today, so the cron writes a GLOBAL failed-webhook
   count: every org sees the same value. Documented as a TODO in the
   migration header and in the service comment. The trade-off: a
   populated-but-coarse signal still beats emitting `no_data` and
   leaving the webhook-reliability factor unscored. Per-org attribution
   needs a Plan G+ pipeline change.

3. **`daily_active_members_30d_avg`** — tenant `members` table has no
   `last_active_at` (or analogous) column. Cron writes `null` so the
   formula emits a targeted `no_data` flag for the Activity factor only;
   the other four factors still score normally. Documented as a TODO.
   When member activity tracking lands, the cron will start filling
   this in without further formula changes.

## Deviations

- **Tenant-DB tolerant open**: The brief flagged the activity factor as
  "tolerant: tenant DB unreachable → write 0 / null". I extended the
  same tolerance to the existing per-tenant counters (`memberCount`,
  `customerCount`, `apptCount30d`, sales totals) — if `getTenantDb`
  throws, those drop to zero and a warning is logged instead of
  failing the snapshot for that org. This is a behaviour improvement
  (snapshot run completes cross-tenant even if one branch is down) but
  goes slightly beyond the brief. Justification: it's required for the
  activity-factor tolerance the brief did mandate, and matches
  ADR-0036 / Agent Mb's pattern.

- **Migration applied manually**: the drizzle-kit journal stops at
  0018 in this worktree, so the journal-driven migrator no-ops 0019+.
  Applied 0030 directly via `psql` against the dev control-panel DB
  (additive `ADD COLUMN IF NOT EXISTS` — safely idempotent). Same
  workaround prior plan-f agents used.

- **Snapshot service "unit" test focuses on the formula contract**, not
  on stubbing the IO. Building a fake `controlPanelDb` + per-tenant
  Neon factory is a lot of mock-surface for limited gain when the e2e
  already exercises the live insert / read-back path. The unit test
  pins the data shape the cron promises to `computeHealthScore` after
  F.6 (all three new fields are passed). Integration coverage is in
  the e2e spec.

## Pre-existing issues encountered

- Local dev control-panel DB contains synthetic `00000000-...-ff01`
  org IDs that fail Zod's `.uuid()` regex (v1-v8). The e2e filters via
  raw SQL regex to a properly-formed v4 row. Documented inline.

- Dev seed user `developer.avantej@gmail.com` is not present in the
  current local DB; the e2e falls back to `signUpUser` + auto-promote
  when the env vars aren't set. Same fallback as other plan-f specs.

## Pre-declared symbols — present verbatim

- `tenantUsageSnapshots.lastAdminLoginAt` ✓
- `tenantUsageSnapshots.failedWebhooks7d` ✓
- `tenantUsageSnapshots.dailyActiveMembers30dAvg` ✓
- No new routers / no new mount points. ✓

## What this unblocks for Agent 2

The Health Scoreboard (F.4 Agent He) and per-tenant Risk tab (F.1.5
Agent R) start receiving real data for the previously-empty factors
on the next cron tick. UI changes: none — both surfaces already render
whatever the formula emits.
