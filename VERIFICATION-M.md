# VERIFICATION-M — Plan F.1.5 Mission Control (Agent M)

## Scope
Aggregator landing page for `/dashboard/platform-admin/`. Single oRPC
proc + 4 KPI cards + at-risk widget + recent-activity feed + recent
signups list. Real-time (no cache). Read-only.

## Files added
- `apps/server/src/routers/platform-admin-dashboard.ts` — `platformAdminDashboardRouter.getOverview`
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/index.tsx` — Mission Control page
- `apps/web/src/components/platform-admin/big-number-card.tsx`
- `apps/web/src/components/platform-admin/recent-activity-feed.tsx`
- `apps/web/src/components/platform-admin/at-risk-widget.tsx`
- `apps/web/e2e/tests/ship/plan-f-1-5/M-mission-control.spec.ts`
- `verification/plan-f-1-5/M-mission-control.webm`

## Files patched
- `apps/server/src/index.ts` — mounted `platformAdminDashboard` namespace.
- `packages/api/src/routers/index.ts` — added `platformAdminDashboardRouterType` (exported) + mounted in `appRouter` type.

## Aggregator reads (all in `Promise.all`)
1. `organizations` total count
2. `organizations` grouped by `paymentStatus`
3. `subscriptions` grouped by `status`
4. `admin_session_actions` latest 10 — joined with `users` (actor email) + `organizations` (target name) via the same `COALESCE(admin_user_id, sessions.admin_user_id)` pattern Plan E E.6 uses.
5. At-risk top 5 — mirrors `platform-admin-tenants-health.listAtRisk` (latest-per-org snapshot + healthScore ASC).
6. `organizations` newest 5 by `createdAt DESC`.

## MRR feasibility
No `TIER_PRICES` constant exists in `packages/types/`, `packages/services/`, or anywhere else searched. `subscriptions` table has no price column either. Per spec, returned `{ cents: 0, estimateAvailable: false }` with a `TODO(plan-f-1-5)` comment in the handler. UI displays "—" with sub-label "Tier pricing not yet wired".

## Playwright results
Command: `bun x playwright test e2e/tests/ship/plan-f-1-5/M-mission-control.spec.ts`
- Result: **1 passed** (6.7s).
- Scenario 1 (RPC shape + at-risk seed): pass. `counts.total=9 atRisk=1 recentSignups=5`. Seeded org appears in atRisk with `healthScore=32`, `criticalFlagCount=1`.
- Scenario 2 (UI render): pass. "Mission Control" heading visible, all 4 KPI cards + at-risk widget + activity feed rendered.
- Scenario 3 (at-risk click → drill-in URL): pass. URL becomes `/dashboard/platform-admin/tenants/996febce-…`.
- Scenario 4 (recent activity click): skipped — no admin_session_actions rows in dev DB. Asserted gracefully.
- Scenario 5 (RBAC support-role read): pass. Demoted to `support`, RPC returns 200 with expected shape, restored to `super_admin`.

Video: `verification/plan-f-1-5/M-mission-control.webm` (~218 KB).

## Pre-existing issues observed
- `listTenants` cast bug — avoided by reading `organizations` directly with Drizzle.
- `getTenantDetail` 500 in dev — affects drill-in page only; mission-control home rendered fine. Scenario 3 only asserts URL change (per spec).
- Pre-existing TS errors in `apps/server` integration tests + `saas-subscription.service.integration.test.ts` — unrelated, no errors introduced by Agent M files.

## Deviations
None. All pre-declared symbols (`platformAdminDashboardRouter`, `platformAdminDashboardRouterType`, mount key `platformAdminDashboard`) match exactly.

## Cache stance
Real-time per design — query uses `staleTime: 0`, `gcTime: 0`, `refetchOnWindowFocus: true`. Refresh button surfaces an explicit retry control.
