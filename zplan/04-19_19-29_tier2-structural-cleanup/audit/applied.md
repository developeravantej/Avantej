# Audit Apply Log

**Applied:** 2026-04-20 13:10 (pass 1), 2026-04-20 13:20 (pass 2), 2026-04-20 (pass 3), 2026-04-20 (pass 4), 2026-04-20 (pass 5)
**Source report:** audit/report.md (audited 2026-04-20 pass 5)
**Plan file:** plan/plan.md

---

## Pass 5 Summary (this pass)

| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 1 (Untitled file vs. folder — trailing slash + wording corrected) |
| TODOs injected | 0 |
| Deferred | 0 |

### Changes — pass 5

**Finding 1 — D.5 `apps/server/src/Untitled` is a file, not a folder**

`apps/server/src/Untitled` is a plain text file (junk chat/notes content), not a directory. The plan's §3.13 and Task D.5 used a trailing slash implying a directory.

1a. **§3.13 (plan.md line 346)** — Changed `Folder to delete: apps/server/src/Untitled/` to `File to delete: apps/server/src/Untitled` (removed slash, changed "Folder" to "File", updated description).

1b. **Task D.5 (plan.md lines 701–704)** — Replaced the `ls apps/server/src/Untitled/` inspect command and "empty or contains only junk / delete the directory" language with a confirmed-file note and the correct `rm apps/server/src/Untitled` deletion command. Updated acceptance from "folder absent" to "file absent".

---

## Pass 4 Summary (historical)

| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 1 (D.6 folder path) |
| TODOs injected | 2 (D.1 filter snippet + useAuth.ts sign-out note) |
| Deferred | 0 |

### Changes — pass 4

**Finding 1 — D.1 `_hierarchy_timestamp` cleanup filter gap (execution gap)**

1a. **Filter snippet TODO injected (plan.md §5 Phase D, Task D.1, `useUserContext.ts` cleanup block)**
    Added inline `// TODO (audit): fix cleanup filter to also remove _hierarchy_timestamp keys — change endsWith("_hierarchy") to k.endsWith("_hierarchy") || k.endsWith("_hierarchy_timestamp")` comment immediately after the `.filter(k => k.startsWith("org_") && k.endsWith("_hierarchy"))` line. The prose already required clearing these keys; the snippet did not implement it.

1b. **useAuth.ts sign-out TODO injected (plan.md §5 Phase D, Task D.1, `useAuth.ts` bullet)**
    Added `<!-- TODO (audit): also add removeItem calls for org_*_hierarchy_timestamp keys on sign-out and org-switch — these orphan keys are not currently removed and will persist post-hardening -->` immediately after the `useAuth.ts` sign-out/org-switch description.

**Finding 2 — D.6 stale cross-reference (auto-fixed)**

2. **plan.md §5 Phase D, Task D.6** — Changed `zplan/04-19_16-40_impersonation/` to `zplan/Semi-done_04-19_16-40_impersonation/` to match the actual folder name on disk.

---

## Passes 1–3 Summary (historical)

| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 0 |
| Broken refs left as TODO | 0 |
| Callers added to impact section | 5 (D.1: 4 files + A.2: 1 test file) — passes 1 & 2 |
| Structural sections stubbed | 0 (plan already 8/8) |
| Unresolved questions consolidated | 1 (§8.4 closed as resolved) — pass 2 |
| User-requested scope removals | 1 (Commissions Ledger empty state — per user instruction) — pass 2 |
| Cosmetic ref fixed | 1 (§2 Before/After row — `/role/view` removed) — pass 3 |
| Blocker note injected | 1 (A.2 — §8.5 PM sign-off required) — pass 3 |
| Deferred (process gaps) | 3 (no execute/log, no chrome-test, §8.5 PM sign-off) |

### Changes — passes 1 & 2 (historical)

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

6. **Removed "Commissions Ledger empty state" feature entirely (per user)**
   Scope was reduced to remove the §3.12 "Commissions Ledger — Empty State" fix across every mention.

7. **§3.5 A.2 architecture note corrected** — Replaced the stale "backend missing" description with "backend already complete" note. The router (`announcements.ts` line 93) and service (`listAnnouncements` WHERE clause) are both already shipped. §3.5 now says "frontend wiring only".

8. **Phase A, Task A.2 — trimmed to frontend-only scope** — Removed the now-done router and service file edits from the A.2 task list. Kept the test file entry. Frontend wiring step clarified.

9. **§3.7 and Task D.1 — added `_hierarchy_timestamp` key** — `branch/view.tsx` writes `org_${organizationId}_hierarchy_timestamp` at 8 additional lines. Added explicit removal requirement alongside `_hierarchy` in both §3.7 and D.1 task file entry.

10. **§6 D.1 risk note updated** — Corrected "reads the hierarchy key" to "reads both `_hierarchy` and `_hierarchy_timestamp`".

### Changes — pass 3 (historical)

11. **§2 Before/After table — removed stale `/role/view` row entry (cosmetic fix)**
    The Before/After row for "Routes removed" listed `/role/view` alongside the four real legacy routes. Removed `/role/view` from the Before cell.

12. **Phase A, Task A.2 — injected §8.5 blocker note**
    Added a top-of-task BLOCKER paragraph to A.2 making it explicit that PM sign-off on §8.5 (audience filter semantics) is required before implementation starts. Also changed `Dependency: none` to `Dependency: none (pending §8.5 resolution)`.

---

## Deferred

- **No `execute/log.md`** → plan hasn't been executed. Run `/execute` or `/execute-pro` when ready.
- **No `chrome-test/`** → no browser verification plan. Run `/chrome-plan` and then `/chrome-run` against the §1 success criteria after execution.
- **§8.5 Audience Filter PM sign-off** → process gap; PM must confirm semantics before A.2 frontend changes land.

## Next steps

1. Get PM sign-off on §8.5 (audience filter semantics) before executing A.2.
2. Run `/execute` — Phases A (A.1, A.3, A.4, A.5), B, C, D are unblocked. A.2 waits on §8.5.
3. After execution, run `/chrome-plan` and `/chrome-run` to verify the §1 success criteria in-browser.
4. The `_hierarchy_timestamp` TODO comments in plan.md D.1 must be resolved by the executor before running D.1.
