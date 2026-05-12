# Audit: 04-19_19-30_tier3-quality-bets

**Audited:** 2026-04-20 (fourth pass)
**Plan file:** plan/plan.md
**Status:** needs-attention

> **Note:** Three prior audit passes were completed on 2026-04-20 (11:46 and 16:40). This report is updated after the fourth pass which fixed the `useBlocker` deprecated API in §3.7.

## Scorecard
| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 0 (all prior broken refs fixed in applied.md) |
| Missing impact | 0 (offender list expanded; branch conflict noted) |
| Unresolved questions | 1 (Q2: Sentry DSN provisioning — no owner designated) |
| Execution state | not started |

## Findings

### Structural gaps

None. All 8 required sections are present with substantive content:
1. Overview — identifies 6 problem areas with specifics (82 toast files, 51 routes, 8 key patterns, etc.)
2. Result (Before/After) — comprehensive table per feature area
3. Technical Architecture — 10 subsections (3.1–3.10) with code samples
4. User Journeys — 11 journeys (4.1–4.11) with old/new narrative
5. Phased Implementation — 7 phases, each delivering ≥1 journey
6. Impact & Breakage Analysis — 4 risk areas with mitigations
7. Cross-Cutting Concerns — env vars table, multi-phase file table, Turborepo pipeline note
8. Open Questions / Risks — 7 questions (Q1–Q7) with recommendations

Minor: Section 4 journeys state location implicitly (by file path) rather than a dedicated "Where it lives" sub-header.

### Broken references (plan → codebase)

None remaining. All passes combined:
- `orpc.attendance.*` → `orpc.checkIns.*` (pass 1)
- `orpc.attendance.todayBookings.key()` → `orpc.checkIns.listTodaysBookings.key()` (pass 1)
- `orpc.commissions.*` → `orpc.commissionSplits.*` (pass 1)
- `Sentry.reactRouterV6BrowserTracingIntegration` → `Sentry.browserTracingIntegration()` (pass 1)
- `orpc.customers.*.key()` → `orpc.customerDirectory.*.key()` (pass 3)
- `useBlocker({ blockerFn, condition })` (deprecated) → `useBlocker({ shouldBlockFn, enableBeforeUnload, disabled })` (pass 4)

Files to be created by the plan (correctly absent — not broken refs):
- `apps/web/src/lib/sentry.ts`, `toast.ts`, `date.ts`
- `apps/web/src/hooks/useUnsavedGuard.ts`
- `apps/web/src/components/error-boundaries/DashboardErrorBoundary.tsx`
- `apps/web/src/components/skeletons/index.tsx`
- `apps/web/src/components/auth/MfaSetupDialog.tsx`
- `apps/web/src/routes/_authenticated/mfa-setup.tsx`, `mfa-verify.tsx`

### Missing impact

None remaining. Prior audit expanded §3.6 offender table from 5 to 9 rows, adding:
- `components/customers/customer-detail-sheet.tsx` (2 raw-key calls)
- `components/forms/hierarchical-branch-form.tsx` (`["user-context"]`)
- `components/merge-tables/unit-of-measure-dashboard.tsx` (6 raw-key calls)
- Expanded `inventory-options-dashboard.tsx` suppliers call sites

Branch conflict risk for `apps/web/src/lib/auth-client.ts` (already modified on `Customer-app`) noted in §6.

### Unresolved questions

1. **Q2: Sentry DSN provisioning** (plan §8) — "designate who creates the Sentry project and provisions the DSN before phase 3.1 begins." No owner is named in the plan or any artifact. Coordination dependency that will block Phase 3.1 if not resolved before execution.

No other blocking questions. Q1, Q3–Q7 have explicit recommendations or clear deferrals.

### Execution & verification gaps

- No `execute/log.md` → plan has not been executed
- No `chrome-test/plan.md` or `chrome-test/results.md` → no browser verification planned or run
- No `research/brief.md` → no prior research artifact (Q5 and Q6 say "verify before implementing" for better-auth twoFactor and useBlocker API, but no formal research was done)
- No `prompts/` folder → no agent handoff prompts generated

**Status: pre-execution.** Plan is written and codebase-aligned; implementation has not begun.

### Additional observations (informational)

- **Timezone scope**: §3.7.2 lists ~13 files with `en-US`/no-timezone formatting. Plan correctly instructs re-grep before starting. List verified accurate as of 2026-04-20.
- **Route count**: Plan states "51-dashboard-page route tree" — confirmed accurate.
- `check-ins-log.tsx` mentioned in §3.7.2 exists at `apps/web/src/components/attendance/check-ins-log.tsx` — not a broken ref (path format issue in initial check was false alarm).

## Priority Actions

1. **Designate Sentry DSN owner** — Q2 in §8 names this as a pre-Phase-3.1 blocker. Assign someone to create the Sentry project and store DSN in CF Pages env vars before `/execute`.
2. **Run pre-flight greps** from `applied.md`: timezone file list refresh, `unitsOfMeasure` + `customers` procedure name verification, `auth-client.ts` diff inspection before Phase 3.6.
3. **Verify `better-auth` twoFactor plugin** against installed version before Phase 3.6 (Q5). (Note: Q6 `useBlocker` API has been pre-verified and fixed in the fourth audit pass.)
5. Run `/execute` or generate `prompts/` handoffs to begin implementation.

## Status rationale

**needs-attention**: 8/8 sections, 0 broken refs, but plan is pre-execution and Q2 (Sentry DSN owner) is an unresolved coordination dependency blocking Phase 3.1.
