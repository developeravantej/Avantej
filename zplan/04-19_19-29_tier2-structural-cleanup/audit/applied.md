# Audit Apply: 04-19_19-29_tier2-structural-cleanup

**Applied:** 2026-04-20 13:10 (pass 1), 2026-04-20 13:20 (pass 2)
**Source report:** audit/report.md (audited 2026-04-20 13:00; pass 2 audited 2026-04-20 13:15)
**Plan file:** plan/plan.md
**Freshness:** ok (plan was unchanged since last audit; report.md re-written from audit-agent return value — see note below)

> Note: The fresh 2026-04-20 13:00 audit agent returned a full report but did not persist it as `audit/report.md` (Write silently dropped). The report content was re-materialised from the agent's return string before this apply pass. The prior `applied.md` (2026-04-20, pre-critical-finding) has been superseded by this entry.

## Summary

| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 0 |
| Broken refs left as TODO | 0 |
| Callers added to impact section | 5 (D.1: 4 files + A.2: 1 test file) |
| Structural sections stubbed | 0 (plan already 8/8) |
| Unresolved questions consolidated | 1 (§8.4 closed as resolved) |
| User-requested scope removals | 1 (Commissions Ledger empty state — per user instruction) |
| Deferred (process gaps) | 3 (no execute/log, no chrome-test, §8.6 PM sign-off) |

## Changes

### Auto-fixes (audit-driven)

1. **§3.7 and Phase D, Task D.1 — expanded localStorage file list (CRITICAL)**
   The audit identified 4 additional files that read/write `user_organizations` and `org_*_hierarchy`. Without touching these, D.1 was a no-op. Added to the D.1 task list:
   - `apps/web/src/components/sign-in-form.tsx` — removes writes on sign-in
   - `apps/web/src/hooks/useAuth.ts` — removes redundant removals on sign-out/org-switch
   - `apps/web/src/components/forms/hierarchical-branch-form.tsx` — removes hierarchy-key cache bust after branch mutations
   - `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx` — removes reads + invalidations of hierarchy key
   Also added a forward-pointer paragraph in §3.7 ("Call sites that also write/read these keys…") so the architecture section matches the task list.

2. **§6 D.1 Impact Analysis — corrected the "only useUserContext.ts" claim**
   Replaced the incorrect "Only `useUserContext.ts` reads these keys" statement with a table of all 5 call sites. Added a new risk bullet about `branch/view.tsx`'s hot-path hierarchy cache potentially regressing once localStorage is removed.

3. **Phase A, Task A.2 — added announcements service test to impact**
   `apps/server/src/tests/unit/services/announcements.test.ts` imports `listAnnouncements` directly. Added it to the A.2 file list with a note to update the signature + add a test case for the new `targetAudience` filter.

4. **§3.2 BranchCombobox — scoped out existing inline implementations**
   Added an "Out of scope for Tier 2" paragraph noting that `rooms/view.tsx`, `stock-requests/view.tsx`, and `transfer-orders/view.tsx` each have their own inline `BranchCombobox` definitions. Rationale: pure-churn refactor, zero user-visible benefit — tagged as opportunistic tech debt.

5. **§8.4 Role View Legacy Route — closed as resolved**
   The audit confirmed `apps/web/src/routes/_authenticated/role/view.tsx` is non-existent. Replaced the open-question prose with a RESOLVED note and removed the role/view deletion bullet from Phase D Task D.2.

### User-requested scope removal

6. **Removed "Commissions Ledger empty state" feature entirely (per user)**
   Scope was reduced to remove the §3.12 "Commissions Ledger — Empty State" fix across every mention:
   - §1 Problem — removed the "commissions ledger appears empty…" bullet
   - §1 Goals — removed goal #15 ("Commissions ledger has a visible 'no commission config' empty state…")
   - §2 Result (Admin/Manager table) — removed the Before/After row for the empty state
   - §3.12 — deleted the entire "Commissions Ledger — Empty State" subsection
   - §3 — renumbered §3.13 → §3.12, §3.14 → §3.13, §3.15 → §3.14
   - §5 Phase A — removed Task A.6 and the "Commissions empty state" entry from the "Delivers journeys" line
   - §8.5 — removed the "Commissions 'No Config' State" open question (it only existed to support §3.12)
   - §8 — renumbered §8.6 → §8.5
   - Appendix — removed the `Commissions view` path entry (file is no longer modified; only `My Commissions view` remains, which is still gated in A.4)

### TODOs injected

None — the audit findings were all concrete enough to auto-fix.

### Deferred

- **No `execute/log.md`** → plan hasn't been executed. Run `/execute` or `/execute-pro` when ready.
- **No `chrome-test/`** → no browser verification plan. Run `/chrome-plan` and then `/chrome-run` against the §1 success criteria after execution.
- **§8.5 (formerly §8.6) Audience Filter PM sign-off** → process gap; PM must confirm semantics before A.2 backend changes land, otherwise the filter may be a no-op or behaviour-change surprise.

## Pass 2 Changes (2026-04-20 13:20)

### Auto-fixes

7. **§3.5 A.2 architecture note corrected** — Replaced the stale "backend missing" description with "backend already complete" note. The router (`announcements.ts` line 93) and service (`listAnnouncements` WHERE clause) are both already shipped. §3.5 now says "frontend wiring only"; the three-step fix list compressed to one step.

8. **Phase A, Task A.2 — trimmed to frontend-only scope** — Removed the now-done router and service file edits from the A.2 task list. Kept the test file entry (add a `targetAudience` test case). Frontend wiring step clarified with the exact query-key + `.filter()` removal pattern.

9. **§3.7 and Task D.1 — added `_hierarchy_timestamp` key** — `branch/view.tsx` writes `org_${organizationId}_hierarchy_timestamp` at 8 additional lines (326, 356, 366, 373, 452, 547, 590, 635). Added explicit removal requirement alongside `_hierarchy` in both the §3.7 fix list and the D.1 task file entry. Without this, a dangling timestamp key persists post-hardening.

10. **§6 D.1 risk note updated** — Corrected "reads the hierarchy key" to "reads both `_hierarchy` and `_hierarchy_timestamp`".

## Next steps

1. Get PM sign-off on §8.5 (audience filter semantics) before executing A.2.
2. Run `/execute` — Phase A and Phase D.1 are now the two highest-value fixes:
   - Phase A.1 (currency migration) and A.4/A.5 (permission gates) are low-risk, no-dep wins.
   - Phase D.1 is still the highest-risk edit — the 5-file fan-out must land atomically so the sign-in flow and branch view remain coherent.
3. After execution, run `/chrome-plan` and `/chrome-run` to verify the seven §1 success criteria in-browser.
4. Re-run `/audit 04-19_19-29_tier2-structural-cleanup` to confirm this pass cleared the findings (expected result: clean — 8/8 sections, 0 broken refs, 0 missing impact).
