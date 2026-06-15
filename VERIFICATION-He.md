# VERIFICATION-He — Plan F.4 Health Scoreboard

Agent: **He** (2 of 6, F.4 sequential)
Branch: `plan-f-4-ops`
Date: 2026-05-17

## Scope delivered
Read-only cross-tenant health overview at
`/dashboard/platform-admin/health`, complementing F.1.5 per-tenant
health proc with a global scoreboard:

- 5-band histogram of current health scores (0-19/20-39/40-59/60-79/80-100
  → red/red/amber/amber/green)
- Top-N at-risk tenants table (latest-snapshot-per-org, reuses
  AtRiskWidget pattern)
- Per-flag-code rollup (count + uniqueOrgs per flag, severity-coded)
- 30-day daily-average score trend (inline SVG sparkline)

## Files created
- `apps/server/src/routers/platform-admin-health.ts` — top-level
  aggregator, `getScoreboard` proc.
- `apps/server/src/routers/platform-admin-health.test.ts` — 6 bun unit
  tests, 47 expect() calls.
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/health.tsx`
- `apps/web/src/components/platform-admin/health-histogram.tsx`
- `apps/web/src/components/platform-admin/risk-flag-rollup.tsx`
- `apps/web/e2e/tests/ship/plan-f-4/He-health-scoreboard.spec.ts`
- `verification/plan-f-4/He-health-scoreboard.webm` (210 KB)

## Files patched (surgical)
- `apps/server/src/index.ts` — import + mount
  `platformAdminHealth: platformAdminHealthRouter` (top-level).
- `packages/api/src/routers/index.ts` — `platformAdminHealthRouterType`
  type stub + appRouter wiring.

## Key implementation notes
- **Latest snapshot per org**: subquery `MAX(snapshot_date) GROUP BY
  organization_id` joined back to `tenant_usage_snapshots`. Aggregation
  (histogram, topAtRisk, flagRollup) done in JS to keep one round-trip.
  Validated by unit test: org 1 has both stale (score 95, yesterday)
  and current (score 5, today) snapshots — only the score-5 row appears
  in topAtRisk.
- **Histogram bands**: `score >= min && score <= max` boundary rule (no
  off-by-one). Boundary edges tested at 0/19/20/39/40/59/60/79/80/100.
- **Flag rollup**: de-dupes within a snapshot, counts unique orgs per
  flag, promotes severity to the most severe observed for that code.
  Sorted by count DESC, ties broken by flagCode ASC.
- **Trend**: single SQL `AVG(health_score) GROUP BY snapshot_date` for
  last 30 days (today inclusive). Drizzle returns AVG as string —
  cast via `Number()` and round to 1 dp.
- **AtRiskWidget reuse**: mapped scoreboard's topAtRisk to the
  widget's `AtRiskOrg` shape; dropped snapshotDate at render (kept in
  the API contract for future drill-in).
- **FLAG_LABELS** duplicated from `risk-flag-list.tsx` per scope
  (no refactor of Agent R's file).

## Verification

### Unit tests (`bun test`)
```
6 pass, 0 fail, 47 expect() calls — 4.97s
```
Covers: `bandIndexForScore` boundary buckets, band sum invariant,
topAtRisk ordering + limit + latest-wins, flagRollup count + uniqueOrgs
+ DESC sort + severity tag, trend daily aggregation + ASC date sort,
unscoredOrgs counter.

### Type check (`bun check-types`)
My files clean. 51 pre-existing errors remain in unrelated test/script
files (`saas-subscription.service.integration.test.ts`,
`webhook-dedupe.service.integration.test.ts`, `org.test.ts`,
`webhooks.routes.integration.test.ts`,
`scripts/inspect-and-cleanup-test-data.ts`,
`scripts/seed-franchise-owner.ts`, `platform-admin-revenue.ts`).
None touched by Agent He.

### E2E (`playwright`)
1 passed in 9.3 s. Real RPC roundtrip against dev DB returned
`totalScoredOrgs: 7, unscoredOrgs: 17` — histogram populated with
real data. Scenarios:
1. RPC shape ✓ (200, 5 bands, arrays, trend)
2. Histogram math ✓ (sum === totalScoredOrgs, min/max monotonic)
3. Flag rollup sort ✓ (count DESC)
4. topAtRiskLimit=5 clamp + ASC by score ✓
5. UI render ✓ (heading, histogram, at-risk widget, flag rollup,
   trend card all visible; no 500)
6. RBAC ✓ (support role → 200)

Video: `verification/plan-f-4/He-health-scoreboard.webm` (210 KB).

## Pre-existing issues observed
- `platformAdminTenants.health.getTenantDetail` 500 (noted in brief) —
  not exercised by scoreboard; at-risk drill-in links route to
  `/tenants/$id` which uses its own loader.
- 51 type errors in unrelated test/script files (listed above).
- Many dev-DB orgs have no snapshots (`unscoredOrgs: 17`) — cron has
  only seeded ~7 orgs. Expected per brief.

## Deviations from brief
None. All OWNED/PATCH files written, no schema changes, no new procs on
the F.1.5 router.

## Hand-off notes
Top-level router key is `platformAdminHealth` (not `platformAdmin.health`)
— client calls: `client.platformAdminHealth.getScoreboard({ ... })`.
