# Audit Applied — 04-19_19-30_tier3-quality-bets

**Applied:** 2026-04-20
**Audit report:** `audit/report.md` (mtime 2026-04-20 11:46)
**Plan file:** `plan/plan.md` (mtime 2026-04-19 19:36 — older than audit, no freshness warning)

---

## Summary

Applied 4 auto-fixes (broken refs + impact gap) and added 2 informational notes. All findings from the audit report were addressed in `plan/plan.md`. No source code outside the session folder was modified.

| Severity | Finding | Action |
|---------|---------|--------|
| HIGH | Wrong oRPC keys: `orpc.attendance.*` → `orpc.checkIns.*`; `orpc.attendance.todayBookings` → `orpc.checkIns.listTodaysBookings` | Auto-fixed §3.6 table |
| HIGH | Wrong oRPC keys: `orpc.commissions.*` → `orpc.commissionSplits.*` (procedures `list` / `listLedger`) | Auto-fixed §3.6 table |
| MEDIUM | `Sentry.reactRouterV6BrowserTracingIntegration` won't instrument TanStack Router | Auto-fixed §3.2 code sample → `Sentry.browserTracingIntegration()`; updated note to "do not use" + manual wiring suggestion |
| MEDIUM | §3.6 offender list incomplete (6+ missing files) | Auto-fixed: added rows for `customer-detail-sheet.tsx`, `hierarchical-branch-form.tsx`, `unit-of-measure-dashboard.tsx`, expanded `inventory-options-dashboard.tsx` (added `suppliers` lines), expanded `invitations-page.tsx` (added line numbers / 3 sites) |
| LOW | `auth-client.ts` already modified on `Customer-app` branch + Phase 3.6 modifies it | Added "Branch Conflict Risk" note in §6 (MFA subsection) |
| LOW (info) | Timezone scope wider than 3 files | Added audit-confirmed list of ~13 files in Task 3.7.2; instructed to re-grep before starting |

---

## Verification of Audit Claims (before applying)

Confirmed via codebase greps:
- `packages/api/src/routers/index.ts`: routers registered as `checkIns` and `commissionSplits` (NOT `attendance` / `commissions`).
- `packages/api/src/routers/check-ins.ts`: procedure name is `listTodaysBookings` (NOT `todayBookings`); `list` exists.
- `packages/api/src/routers/commission-splits.ts`: procedures `list`, `listLedger`, `getByAppointment`, `myCommissions`, `approve`, `markPaid`, `voidSplit` exist.
- All 5 additional offender files (`customer-detail-sheet.tsx`, `hierarchical-branch-form.tsx`, `unit-of-measure-dashboard.tsx`, `inventory-options-dashboard.tsx`, `invitations-page.tsx`) were grepped and contain raw-string `invalidateQueries` calls at the line numbers listed.
- File mtimes: audit (2026-04-20 11:46) is newer than plan (2026-04-19 19:36) — no freshness warning needed.

---

## Changes Made to `plan/plan.md`

1. **§3.6 table** (oRPC keys): replaced `attendance` / `commissions` references with `checkIns` / `commissionSplits`; expanded table to 9 rows (added 4 new offender entries with audit-confirmed line numbers); appended a "Router name pitfalls" callout to make the naming gotcha explicit.
2. **§3.2** (Sentry): replaced `reactRouterV6BrowserTracingIntegration` with `browserTracingIntegration()` in the code sample; rewrote the note below to clearly forbid the React-Router integration and outline a manual TanStack-Router subscription path.
3. **§6 — MFA subsection**: added a new "auth-client.ts Branch Conflict Risk" paragraph at the top of the MFA risk block, pointing implementors at the in-progress branch edit.
4. **§5 Phase 3.7 — Task 3.7.2**: replaced the inline 3-file list with a wider audit-confirmed list (13 files) + instruction to re-grep before starting (since drift is likely between audit and execution).

---

## Deferred Items

None. All findings classified by the orchestrator as auto-fix or note were applied. The audit's two INFORMATIONAL items (timezone scope, route count) were each addressed (timezone expanded; route-count claim was already correct in the plan).

No new TODOs introduced.

---

## Next Steps

The plan is now codebase-aligned and ready for `/execute`. Recommended pre-flight before execution:

1. Re-run the timezone grep (`grep -rn "toLocaleDateString\|toLocaleString\|en-US" apps/web/src`) to refresh the file list — the audit list was a snapshot.
2. Verify exact procedure names for `unitsOfMeasure` and `customers` routers when fixing those offenders (the §3.6 table notes "verify exact procedure name").
3. Inspect the current diff on `apps/web/src/lib/auth-client.ts` before Phase 3.6 to coordinate with the in-progress branch edits.
4. Decide who provisions the Sentry DSN (Open Question Q2) before Phase 3.1 begins.
