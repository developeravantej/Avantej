# Doc Consistency Audit
**Session:** 04-19_19-30_tier3-quality-bets
**Lens:** doc-consistency
**Findings:** 6 (1 critical · 2 high · 2 medium · 1 low)

## Findings

### [CRITICAL] `inventory-options-dashboard.tsx` is 27 lines — cited line numbers (61–202) are out of bounds
**Plan claims:** §3.6 table row 3 lists this file as an invalidateQueries offender with `["brands", organizationId]` and `["suppliers", organizationId]` calls at lines 61/77/89 + 167/191/202.
**Actual:** File is 27 lines total. No `invalidateQueries`, `queryKey`, `brands`, or `suppliers` patterns are present. The file is a thin wrapper around `ConsolidatedTabs` that delegates to `BrandsTabPage`, `CategoriesTabPage`, `SuppliersTabPage` subcomponents. Phase 3.3 task 3.3.2 instructs the implementer to edit this file — they will open it, find 27 lines, and have no idea what to do. This will block Phase 3.3 execution.
**File:** `apps/web/src/components/merge-tables/inventory-options-dashboard.tsx` (27 lines)
**Fix:** Remove row 3 from the §3.6 offenders table. Locate the actual mutation/invalidation code in the subcomponents (`BrandsTabPage`, `SuppliersTabPage`) before Phase 3.3 starts. Update the table with the correct file paths and line numbers.

---

### [HIGH] Q2 (Sentry DSN owner) is an explicit execution blocker and remains unassigned
**Plan claims:** §8 Q2: "**Owner: _(unassigned — must be filled before /execute)_**". Also contains: `<!-- TODO (audit): No owner designated for Sentry project creation. This is a pre-Phase-3.1 blocker — Phase 3.1 cannot be executed until someone creates the Sentry project and stores the DSN as VITE_SENTRY_DSN in CF Pages env vars. Assign an owner before running /execute. -->`
**Actual:** The blocking comment is still present at line 676. Owner is still unassigned. Phase 3.1 cannot proceed without this — `initSentry()` will silently do nothing in all environments until the DSN is provisioned.
**File:** `zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:676`
**Fix:** Before `/execute`: assign a specific person/team name in the Q2 owner field. Remove the TODO comment once assigned.

---

### [HIGH] Better-Auth `twoFactor` API (Q5) is unverified and deferred to implementation time
**Plan claims:** §3.10 and §8 Q5: "verify the exact API before implementation"; "Check `node_modules/better-auth/plugins/two-factor/index.d.ts` for the exact signature before writing any MFA code."
**Actual:** The `better-auth` version is `catalog:` in `apps/server/package.json` — unresolved at plan-write time. Q5 defers all verification to "before Phase 3.6", but the plan's code samples (§3.10) already assume `getTOTPUri`, `enable`, `verify`, `disableTwoFactor` as method names. If the installed version's API differs, all 6 Phase 3.6 tasks reference the wrong method signatures.
**File:** `zplan/04-19_19-30_tier3-quality-bets/plan/plan.md` (§3.10, §8 Q5)
**Fix:** Resolve Q5 as a pre-Phase-3.6 spike task: check the installed better-auth version's two-factor plugin exports and update §3.10 code samples if they differ. Add this as task 3.6.0 in the plan.

---

### [MEDIUM] §3.6 `inventory-options-dashboard.tsx` also misidentified in `audit/applied.md`
**Plan claims:** `audit/applied.md` states the prior audit "expanded `inventory-options-dashboard.tsx` (added `suppliers` lines)" — implying a prior audit run added the suppliers invalidation rows to the table.
**Actual:** The file has 27 lines and never had invalidateQueries. The prior audit-apply pass added a fabricated entry to the table in the plan based on an incorrect grep match. Both the plan and the applied-audit record are wrong for this file.
**File:** `zplan/04-19_19-30_tier3-quality-bets/audit/applied.md`
**Fix:** Update `applied.md` to note the correction: the `inventory-options-dashboard.tsx` entry was an audit error; subcomponents are the actual mutation sites.

---

### [MEDIUM] Q6 (`useBlocker` API signature) deferred to implementation time — specific version in node_modules
**Plan claims:** §8 Q6: "Check `node_modules/@tanstack/react-router/dist/esm/useBlocker.d.ts` for the exact signature before writing `useUnsavedGuard`."
**Actual:** The installed version is `@tanstack/react-router@1.167.4`, not the `^1.114.25` assumed in the API note. The plan's `useBlocker` code sample (`{ shouldBlockFn, enableBeforeUnload, disabled }`) is correct for 1.167.4 (verified by type-safety auditor). However, the plan doesn't document the installed version — future readers won't know whether the verification was done.
**File:** `zplan/04-19_19-30_tier3-quality-bets/plan/plan.md` (§3.7, §8 Q6)
**Fix:** Update the "API note" in §3.7 to say "verified against v1.167.4 (installed)". Mark Q6 as Resolved: YES with the version number.

---

### [LOW] Phase 3.7.2 timezone file list is explicitly flagged as a point-in-time snapshot
**Plan claims:** §5 Phase 3.7.2: "Re-grep before starting (`grep -rn ...`) — the list above was correct at audit time but new occurrences may have been added."
**Actual:** The instruction to re-grep is present — this is not a missing check, it's a documented risk. The plan handles this correctly. Flagged LOW only to ensure the implementer doesn't skip the re-grep and trust the static list.
**File:** `zplan/04-19_19-30_tier3-quality-bets/plan/plan.md` (Phase 3.7.2)
**Fix:** No change needed. The re-grep instruction is adequate. Consider promoting the timezone grep command from a parenthetical note to a numbered task (e.g., "3.7.0: Run grep, update file list") to ensure it isn't skipped.

---

## Summary
One CRITICAL execution blocker was found: `inventory-options-dashboard.tsx` is 27 lines but the plan cites line numbers up to 202 — an implementer following the plan will find nothing to fix and be confused. The entry was added by a prior audit-apply run that made an incorrect grep match. Two HIGH findings remain open: the Sentry DSN owner is still unassigned (explicit `/execute` blocker) and the better-auth twoFactor API has never been verified. All other referenced files exist and are correctly described. Line number citations for `unit-of-measure-dashboard.tsx`, `customer-detail-sheet.tsx`, `hierarchical-branch-form.tsx`, and `invitations-page.tsx` are accurate.
