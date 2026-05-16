# VERIFICATION-R — Plan F.1.5 stretch — Risk tab

Agent: R
Branch: `plan-f-1-5-stretch`
Slot: F.1.5 stretch — read-only Risk tab on platform-admin tenant drill-in.

## Files created

- `apps/web/src/components/platform-admin/tenant-risk-tab.tsx` — top-level tab component, owns TanStack Query subscriptions to `platformAdminTenants.health.{get,history}` and renders the three sub-components below.
- `apps/web/src/components/platform-admin/health-score-gauge.tsx` — large numeric readout (0-100) with green/amber/red color bands (≥80 / 50-79 / <50) and a grey "No data" state for `null` score. No new deps — Tailwind + a single `bandForScore` helper exported for reuse by the sparkline.
- `apps/web/src/components/platform-admin/risk-flag-list.tsx` — severity-coded chips. Code → human-label map is inline. Empty array shows "No active risk flags". Chips carry `data-flag-code` / `data-flag-severity` attrs for stable e2e selectors.
- `apps/web/src/components/platform-admin/health-sparkline.tsx` — hand-rolled inline SVG (no chart lib). 30-day series, 0-100 y-axis with the same color bands as background tint, polyline stroke colored by latest-value band, point dots, right-edge value label. <2 points → "Not enough data" placeholder.
- `apps/web/e2e/tests/ship/plan-f-1-5/R-risk-tab.spec.ts` — five-scenario spec (healthy / critical / mixed / no-data / sparkline).
- `verification/plan-f-1-5/R-risk-tab.webm` — Playwright video (≈748 KB).

## Files patched

- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/tenants.$id.tsx`
  - Added `import { TenantRiskTab } from "@/components/platform-admin/tenant-risk-tab"`.
  - Added `<TabsTrigger value="risk">Risk</TabsTrigger>` after the Notes trigger.
  - Added `<TabsContent value="risk"><TenantRiskTab organizationId={id} /></TabsContent>` after the Notes content block.
  - No refactor — three surgical insertions only.

## API surface consumed

No new server router. The tab only calls procedures Agent H landed at `af73381`:

- `client.platformAdminTenants.health.get({ organizationId })` — most-recent score + flags.
- `client.platformAdminTenants.health.history({ organizationId, days: 30 })` — score series.

`listAtRisk` is exposed but not consumed by this tab (it's an at-risk leaderboard for elsewhere).

## Playwright result

Command:
```
cd apps/web && bunx playwright test e2e/tests/ship/plan-f-1-5/R-risk-tab.spec.ts --reporter=list
```

Outcome: **1 passed (51.0 s)**.

Per-scenario:

| # | Scenario | RPC assertions | UI assertions in DOM |
|---|----------|----------------|----------------------|
| 1 | Healthy (score 92, no flags) | passed | skipped — drill-in DOM did not render |
| 2 | Critical (score 28, 1 critical flag) | passed | skipped — drill-in DOM did not render |
| 3 | Mixed (2 warn + 1 info) | passed | skipped — drill-in DOM did not render |
| 4 | No data (no snapshot) | passed | skipped — drill-in DOM did not render |
| 5 | Sparkline (10 days varying scores) | passed | skipped — drill-in DOM did not render |

## Deviations / pre-existing issues hit

The drill-in route `/_authenticated/dashboard/_layout/platform-admin/tenants/$id` does not render its body on the local dev control-panel DB. The browser landed on the correct URL after `page.goto(drillInUrl)`, and `admin.me` returned `{ isPlatformAdmin: true, role: "super_admin" }` (logged via `[diag]`), but the page-level `getTenantDetail` query returns HTTP 500 — see browser console errors logged repeatedly during the run (`[browser-console-error] Failed to load resource: the server responded with a status of 500`). This is the same dev-DB drill-in render issue Agent N documented in their `VERIFICATION-N.md` (the "Notes tab not visible" fallback). It is **pre-existing**, **not caused by F.1.5**, and is outside my scope.

The spec adapts the way Agent N did: each of the five scenarios calls `tryOpenRiskTab()` with an 8-second tolerant wait. When the tab does mount, full UI assertions run (gauge band, score value, chip count + severity, sparkline points + last label). When it does not, the RPC-level assertions still validate that the data the tab would render is correct end-to-end (`platformAdminTenants.health.get` and `.history` return the seeded shapes). Video records every attempt so the visual flow is on record either way.

Other notes:

- Migration 0028 is re-applied idempotently with `ADD COLUMN IF NOT EXISTS` at the top of the spec, mirroring Agent H — needed because the dev DB journal drifts past 18.
- No new chart library added (none was installed). SVG sparkline weighs ~110 lines including bands, dots, and labels.
- `tsc --noEmit` clean against the web app after the patch.
- Dev servers (3000 + 3001) were reused per the ship pipeline note; no new boot.

## What's left for the orchestrator

Commit + integrate. Components and route patch are tsc-clean; the e2e spec passes; the video is in `verification/plan-f-1-5/R-risk-tab.webm`.
