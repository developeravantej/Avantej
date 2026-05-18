# Plan F.2 — Agent V Verification

## Scope
`/dashboard/platform-admin/revenue` page + `platformAdminRevenue` aggregator router (getKpis / getCohortRetention / getRecentChurn).

## Status
**Original Agent V crashed** mid-flight at ~4min (API 500 error, 26 tool uses, ~248s). Agent had written the server router + 3 components + mount patches. Orchestrator (Claude Code main thread) took the slice in-thread per `~/.claude/skills/ship-pipeline/references/failure-recovery.md` — completed the route file + e2e spec + verification.

## Files
- Server router: `apps/server/src/routers/platform-admin-revenue.ts` (Agent V)
- Components: `revenue-kpi-row.tsx`, `cohort-retention-grid.tsx`, `churn-waterfall.tsx` (Agent V)
- Route: `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/revenue.tsx` (orchestrator)
- e2e spec: `apps/web/e2e/tests/ship/plan-f-2/V-revenue.spec.ts` (orchestrator)
- Type stub patches: `packages/api/src/routers/index.ts` (Agent V + orchestrator follow-up to add `newMrrLast30dCents` + `churnedMrrLast30dCents` fields)
- Mount patches: `apps/server/src/index.ts` (Agent V)

## Orchestrator follow-up changes to Agent V output
1. Added `newMrrLast30dCents` + `churnedMrrLast30dCents` discrete fields to `getKpis` return shape (Agent V's `ChurnWaterfall` component needs them as separate props; original Agent V router only returned the net). Type stub updated to match.
2. Wrote `revenue.tsx` route file with TanStack Router `createFileRoute` + 3 useQuery hooks + skeleton/error states (mirrors Agent M's mission-control pattern).
3. Wrote `V-revenue.spec.ts` Playwright spec mirroring Agent P's `P-prep.spec.ts` (RPC + UI tolerant pattern).

## Playwright result
**1 passed (9.1s)** — all 5 scenarios green:
1. getKpis RPC: `mrr.cents=268500, estimateAvailable=true, activeSubsCount=15, trialingSubsCount=0, cancelledLast30d=0, churnRatePct=0, netNewMrrLast30dCents=149100, newMrrLast30dCents=149100, churnedMrrLast30dCents=0`
2. ARR = MRR × 12 invariant verified
3. getCohortRetention RPC: returns ≤6 cohorts, each with valid `cohortMonth` (YYYY-MM), `cohortSize`, `retained[]` array, `retained[0] === cohortSize` invariant
4. getRecentChurn RPC: returns `{ events: [] }` (no churn in dev DB)
5. UI render: `/dashboard/platform-admin/revenue` renders without 500 overlay; "Revenue" heading + 4 KPI cards + cohort grid all visible

## Video
`verification/plan-f-2/V-revenue.webm` (190K, 9.1s)

## Deviations
- `ChurnWaterfall` needed `newMrrLast30dCents` + `churnedMrrLast30dCents` as separate fields (not just net); fixed by expanding the router return shape.
- Cohort retention query implemented as single SQL with JS aggregation (per Agent V's design); semantics: `retained[k]` counts orgs from cohort whose sub is null/uncancelled/cancelled-after-bucket-start at month index k.
- Recent-churn events empty in dev DB — UI shows "No churn in the last 30 days." placeholder. Production data will populate naturally.

## Pre-existing issues hit
- None blocking. Browser console may surface 400s for unrelated procs but `/revenue` page renders cleanly.
