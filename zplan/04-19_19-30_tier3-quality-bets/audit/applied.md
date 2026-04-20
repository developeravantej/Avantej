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

---

## Second Audit Pass — 2026-04-20 (post-apply state)

**Report:** `audit/report.md` (audited 2026-04-20 16:40 — this is the second audit)
**Plan mtime at time of this pass:** 2026-04-20 (after first apply — report is fresh, no staleness warning)

### Summary

| Category | Count |
|----------|-------|
| Broken references fixed (auto-fix) | 0 (none remaining) |
| Missing callers added (auto-fix) | 0 (none remaining) |
| Sections stubbed (structural gap) | 0 (all 8 sections present) |
| TODOs injected (unresolved question) | 1 |
| Deferred (execution/process gaps) | 4 |

### Changes

**1. TODO injected — Q2 Sentry DSN owner (§8)**
- Finding: Q2 names "designate who creates the Sentry project" but no owner is assigned; this is a pre-Phase-3.1 coordination blocker per the audit.
- Action: Injected `<!-- TODO (audit): No owner designated... -->` comment above Q2 body, and added `**Owner: _(unassigned — must be filled before /execute)_**` line after the existing text.
- File edited: `plan/plan.md` §8 Q2.

### Deferred

| Finding | Reason deferred |
|---------|----------------|
| No `execute/log.md` — plan not yet executed | Process gap. Run `/execute` to begin. |
| No `chrome-test/plan.md` or results | Process gap. Run `/chrome-plan` then `/chrome-run` after execution. |
| No `research/brief.md` for Q5 (better-auth twoFactor) and Q6 (useBlocker API) | Process gap. Plan already says "verify before implementing". Check node_modules before Phase 3.6. |
| No `prompts/` handoff folder | Process gap. Run `/orchestrator` to generate handoff prompts if needed. |

### Next Steps (updated)

1. **Assign Q2 owner** — fill `**Owner:**` in plan §8 Q2 before running `/execute`. Phase 3.1 cannot start without the Sentry DSN in CF Pages env vars.
2. Run pre-flight greps: timezone file list refresh, `unitsOfMeasure` + `customers` procedure name verification, `auth-client.ts` diff inspection before Phase 3.6.
3. Verify `useBlocker` API against `@tanstack/react-router` v1.114.25 before writing `useUnsavedGuard` (Q6).
4. Verify `better-auth` twoFactor plugin against installed version before Phase 3.6 (Q5).
5. Run `/execute` or generate `prompts/` handoffs to begin implementation.

---

## Third Audit Pass — 2026-04-20 (re-audit findings)

**Findings source:** re-audit (two specific findings supplied by orchestrator)
**Plan mtime at time of this pass:** 2026-04-20 (after second apply)

### Summary

| Category | Count |
|----------|-------|
| Broken references fixed (auto-fix) | 1 |
| TODOs injected | 0 (already present from second pass) |
| Deferred | 0 |

### Changes

**1. Broken ref fixed — §3.6 offender table `orpc.customers.*`**
- Finding: The `customer-detail-sheet.tsx` row in §3.6 referenced `orpc.customers.*.key()`. No router named `customers` exists in the codebase.
- Verification: Grepped `packages/api/src/routers/index.ts` — confirmed routers are `customerDirectory` (line 115) and `customerProfiles` (line 79). Grepped `apps/web/src/components/customers/customer-detail-sheet.tsx` lines 264–269 — both raw-key calls use `"customerDirectory"` as the root string key.
- Action: Replaced the vague `orpc.customers.*.key()` hint with `orpc.customerDirectory.*.key()`, documented both raw keys that appear in the source, and noted that `orpc.customerProfiles.*.key()` should be used if any call targets a member profile. Added instruction to verify exact procedure names in `customer-directory.ts` before fixing.
- File edited: `plan/plan.md` §3.6 table row for `customer-detail-sheet.tsx`.

**2. TODO for Q2 Sentry DSN owner**
- Finding: Report asked to inject `<!-- TODO (audit): assign Sentry project owner before Phase 3.1 -->` next to Q2 if not already present.
- Verification: Grepped `plan/plan.md` for `TODO.*audit.*Sentry` — comment already exists at line 683 from the second audit pass.
- Action: No change needed. 0 TODOs injected.

---

## Fourth Audit Pass — 2026-04-20 (this pass)

**Findings source:** fresh re-audit against installed node_modules
**Plan mtime at time of this pass:** 2026-04-20 (after third apply)

### Summary

| Category | Count |
|----------|-------|
| Broken references fixed (auto-fix) | 1 |
| TODOs injected | 0 |
| Deferred | 0 |

### Changes

**1. Broken ref fixed — §3.7 `useBlocker` deprecated API**
- Finding: The `useUnsavedGuard` code sample in §3.7 used `useBlocker({ blockerFn, condition })` which is `@deprecated` in the installed `@tanstack/react-router` v1.114.25. Verified against `node_modules/@tanstack/react-router/dist/esm/useBlocker.d.ts` — the non-deprecated overload uses `{ shouldBlockFn, enableBeforeUnload, disabled }`. Additionally, `enableBeforeUnload` handles `beforeunload` internally, making the separate `useEffect` in the original sample unnecessary.
- Action: Replaced the `useUnsavedGuard` implementation in §3.7 with the modern API (`shouldBlockFn`, `enableBeforeUnload`, `disabled`). Removed the now-redundant `useEffect`/`beforeunload` block. Added an API note below the code sample documenting the deprecation and the `enableBeforeUnload` built-in.
- File edited: `plan/plan.md` §3.7 code sample.
- File edited: `audit/report.md` — updated broken-refs list, priority actions (Q6 now pre-verified), pass date.

### Deferred

None.

### Next Steps (updated)

1. **Assign Q2 owner** — fill `**Owner:**` in plan §8 Q2 before running `/execute`. Phase 3.1 cannot start without the Sentry DSN in CF Pages env vars.
2. Run pre-flight greps: timezone file list refresh, `unitsOfMeasure` procedure name verification, `auth-client.ts` diff inspection before Phase 3.6.
3. Verify `better-auth` twoFactor plugin against installed version before Phase 3.6 (Q5). (Q6 `useBlocker` is now pre-verified — no action needed at implementation time.)
4. Run `/execute` or generate `prompts/` handoffs to begin implementation.
