# E2E-Screenshot Test Plan — MOVE OS Parity (WS1–WS7 + §12 reconcile)

Target: **live prod** `https://app.avantej.com` as MOVE Owner (`admin@moveprivatefitness.com`).
Pipeline: e2e-screenshot (5 phases). Module = review-page section.

## Phase status

| Phase | State |
|---|---|
| 1 Detect | ✅ web + chrome-devtools MCP |
| 2 Strategy | ✅ this doc |
| 3 Implement journeys | ⏳ (journeys below, ready to encode) |
| 4 Run + screenshot | ⛔ **blocked — chrome-devtools MCP disconnected** |
| 5 Review HTML | ⏳ → `docs/test-plan/e2e-screenshots.html` (on Phase-4 completion) |

## Live-data safety (prod)

Two mutation classes per journey:
- **RO** = read-only navigation (no writes) → safe, no cleanup.
- **WCC** = write-then-commit-then-cleanup → scope every row to a test id, record ids, delete via `~/.move-tenant-conn` in a `finally` (proven pattern in `pos-prod-verify.html`).

## Test matrix (module → journey → screenshots → assert)

| # | Module | Journey (steps) | Shots | Assert | Class |
|---|--------|-----------------|-------|--------|-------|
| 1 | **WS1 multi-currency** | Login → Commissions → Liability tab → observe per-currency totals → POS service picker shows (MY) vs (TH) price variants | 4 | liability grouped per currency; TH prices distinct from MY (no co-mingling) | RO |
| 2 | **WS2 reports** | Reports → Overview KPIs+chart → open each of 10 tabs → set tax-basis toggle → CSV export one report | 6 | 10 tabs render; incl/pre-tax toggle changes totals; CSV downloads | RO |
| 3 | **WS3 tax + numbering** | Tax Rates (country-scoped Malaysia SST 8% + org 0% default) → POS sale → confirm SST 8% applied → receipt shows gapless SO/INV/PAY-NNNNNN | 5 | tax math = subtotal×8%; doc numbers sequential+gapless | WCC |
| 4 | **WS4 appt lifecycle** | Appointments list → multi-select 2 appts → bulk status → verify both updated; (cron auto-complete = documented, not UI) | 4 | bulk `updateStatusBulk` applies to all selected | WCC |
| 5 | **WS5 payroll lock** | Payroll Periods → pick branch+date → Lock → row shows LOCKED+locked-by → attempt void a commission in locked window → blocked 403 | 5 | lock persists; write-gate blocks void/dispute/cancel in-period | WCC |
| 6 | **WS6 CSV import** | Import Data → type=Clients → paste 2-row CSV → Preview (validate) → row errors surfaced → Commit → history row | 6 | preview validates before write; commit creates rows; rollback on bad row | WCC |
| 7 | **WS7 CSV export** | Export Data → Download one dataset CSV → Export-all ZIP → verify branch-scoped rows | 4 | 14 datasets listed; ZIP bundles all; RBAC scopes to accessible branches | RO |
| 8 | **§12 commission incentive** | Commissions → configure a threshold → run incentive sweep (or wait cron) → award appears for qualifying staff → idempotent re-run = no dup | 5 | award created once; unique-key idempotent | WCC |
| 9 | **§12 renewal-vs-new** | POS renewal sale vs new sale of same package → commission split uses correct rate per sales_type | 4 | rate differs renewal vs new; commission_tracks.sales_type honored | WCC |
| 10 | **§6 external busy (gcal)** | Trainer with Google Calendar connection → external busy block pulled → appointment booking respects busy window | 4 | external_busy_blocks populated; booking blocked in busy window | RO (needs a connected trainer) |

## Prioritized runnable subset (first pass)

RO-only, zero prod mutation, fastest to green: **#1, #2, #7, #10**.
Then WCC with cleanup: **#3, #5, #6** (highest-value domain rules).
Backlog / needs setup: **#4** (needs bookable appts), **#8/#9** (need thresholds + renewal data configured on MOVE).

## Existing captures (already produced this program)

- `docs/test-plan/pos-prod-verify.html` — WS1/WS3 POS **behavioural** e2e: real committed sale, per-installment RM186.30 (not full RM745.20), gapless numbering, then DB restored pristine. (8 frames, WCC done+cleaned.)
- `docs/test-plan/ws1-7-feature-tour.html` — WS1–WS7 **surface** tour: one section/workstream, 8 captioned frames.

## To execute Phase 4 (when chrome-devtools MCP is back)

1. Encode journeys as `e2e-web/<module>/<test>.journey.json` with `capture:true` on critical steps.
2. Drive each live via chrome-devtools MCP, serial, capture per critical action to `e2e-web/<module>/<test>/NN-*.png`, append to `e2e-web/run-results.json`.
3. `node <skill>/scripts/gen-review-html.mjs --source chrome-devtools --results e2e-web/run-results.json --out docs/test-plan/e2e-screenshots.html`.
