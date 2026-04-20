# Audit: 04-19_19-29_tier2-structural-cleanup

**Audited:** 2026-04-20 13:00
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 3 new-file paths (expected pre-execution); 0 broken existing refs |
| Missing impact | 2 gaps (1 critical: D.1 localStorage; 1 minor: announcements test) |
| Unresolved questions | 6 in §8 — all explicitly deferred, none forgotten; 1 is now answerable |
| Execution state | not started (no execute/log.md, no chrome-test/) |

---

## Findings

### Structural gaps

All 8 required sections are present with substantive content. No gaps.

- §1 Overview — problem, goals, success criteria, scope-out ✓
- §2 Result — Before/After tables for three user roles ✓
- §3 Technical Architecture — 15 sub-sections, one per fix ✓
- §4 User Journeys — 11 journeys, all with explicit "Where it lives" ✓
- §5 Phased Implementation — 4 phases (A–D), each delivers ≥1 journey ✓
- §6 Impact & Breakage Analysis — callers listed per change ✓
- §7 Cross-Cutting Concerns — error handling, testing, migration, rollback ✓
- §8 Open Questions / Risks — 6 items, all substantive ✓

---

### Broken references (plan → codebase)

These are files the plan will **create** — they are correctly missing pre-execution:

- `packages/db/src/migrations/tenant/0008_expenses_currency_myr.sql` — task A.1 creates it
- `apps/web/src/components/ui/branch-combobox.tsx` — task B.1 creates it
- `apps/web/src/components/ui/pagination-bar.tsx` — task B.5 creates it
- `apps/web/src/components/ui/error-state.tsx` — §7 says to create in Phase A
- `apps/web/src/routes/_authenticated/role/view.tsx` — plan §3.13 correctly notes to confirm first; confirmed MISSING, no deletion needed

All other 32 file paths resolve to existing files. All symbols checked (`getUnreadCount`, `listNodes`, `requirePermission`, `useUserContext`, `listLedger`, `commissionSplits`, `installmentPlans`, `adminOverview`) confirmed present in codebase.

---

### Missing impact

#### CRITICAL — D.1 localStorage security hardening

**Plan claim (§6 D.1):** "Only `useUserContext.ts` reads these keys. No other component reads them directly. Safe to remove."

**Reality — 4 additional files read/write these keys, not listed in the plan:**

| File | Usage |
|------|-------|
| `apps/web/src/components/sign-in-form.tsx` | **Writes** both `user_organizations` and `org_${org.id}_hierarchy` on every sign-in |
| `apps/web/src/hooks/useAuth.ts` | Removes both keys on sign-out and org-switch (lines 147, 151, 159, 162) |
| `apps/web/src/components/forms/hierarchical-branch-form.tsx` | Removes `org_${organizationId}_hierarchy` after branch mutations (line 391) |
| `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx` | Reads and invalidates `org_${organizationId}_hierarchy` (lines 118, 135, 323) |

**Risk:** If D.1 only touches `useUserContext.ts`, `sign-in-form.tsx` will still write the sensitive keys on every sign-in — making the security hardening completely ineffective. The `branch/view.tsx` page reads a key from localStorage that will no longer be written, causing a silent cache miss pattern.

**Required additions to D.1 task list:**
- `apps/web/src/components/sign-in-form.tsx` — remove writes of `user_organizations` and `org_*_hierarchy`
- `apps/web/src/hooks/useAuth.ts` — remove removals of now-nonexistent keys (or keep as harmless cleanup)
- `apps/web/src/components/forms/hierarchical-branch-form.tsx` — remove `localStorage.removeItem` of hierarchy key
- `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx` — remove localStorage reads/invalidations of hierarchy key

#### MINOR — Announcements service test

Plan modifies `packages/services/src/announcements.service.ts` (task A.2 — adds `targetAudience` param to `listAnnouncements`). `apps/server/src/tests/unit/services/announcements.test.ts` imports this function directly and will need updating. Not listed in the plan's impact section.

#### NOTE — Inline BranchCombobox already exists in 3 additional files

The plan (§3.2) says to create a shared `branch-combobox.tsx` and wire it into 3 pages. However, `rooms/view.tsx` (line 523), `stock-requests/view.tsx` (line 437), and `transfer-orders/view.tsx` (line 450) each already have their own local inline `BranchCombobox` definitions. The plan should explicitly decide whether to refactor those pages to use the new shared component, or leave them as known tech debt. Currently unscoped.

---

### Unresolved questions

All 6 items in §8 are explicitly deferred or awaiting PM input — none are accidentally forgotten:

1. **§8.1 File Upload** — deferred to Tier 3; decision needed on R2 vs third-party
2. **§8.2 Cold Load UX** — acceptable trade-off documented; no action
3. **§8.3 Payouts total count** — deferred to Tier 3 pending PM request
4. **§8.4 Role View legacy route** — **now answerable:** `_authenticated/role/view.tsx` confirmed non-existent. This question can be closed; no deletion needed
5. **§8.5 Commission empty state link** — verify `commissionPercentage` is exposed in service edit form before pointing users there
6. **§8.6 Announcements audience semantics** — PM confirmation needed before implementing A.2

---

### Execution & verification gaps

- No `execute/log.md` — plan has not been executed
- No `execute/` folder — `/execute` or `/execute-pro` not yet run
- No `chrome-test/` folder — browser verification not planned or run
- No `prompts/` folder — no handoff prompts generated
- `audit/applied.md` present — a prior audit-apply pass ran on 2026-04-20 and made 4 corrections (B.6 caller added, A.2/A.3 prose corrected, D.4 trimmed). This report is a fresh independent audit.

---

## Priority Actions

1. **Fix D.1 impact analysis (CRITICAL):** Add `sign-in-form.tsx`, `useAuth.ts`, `hierarchical-branch-form.tsx`, and `branch/view.tsx` to the D.1 task list and files-affected section. Without touching `sign-in-form.tsx`, the localStorage hardening delivers zero security benefit — the keys are re-written on every sign-in.

2. **Close §8.4:** `_authenticated/role/view.tsx` is confirmed non-existent. Remove the open question; strike the role/view deletion bullet from D.2.

3. **Scope BranchCombobox refactor:** Decide whether B.1 also refactors `stock-requests/view.tsx` and `transfer-orders/view.tsx` (which have identical inline implementations). If yes, add to B-phase tasks. If no, add a note.

4. **Get PM sign-off on §8.6 before executing A.2** — the audience filter semantics determine whether server-side filtering is additive or a behavior change.

5. **Run `/execute` or `/execute-pro`** to begin implementation, then `/chrome-run` against §1 success criteria.

---

## Status rationale

**needs-attention**: The D.1 localStorage impact gap is material — the hardening is non-functional without `sign-in-form.tsx`. One open question (§8.4 role/view) is now answerable. Otherwise the plan is high quality: 8/8 sections, well-specified journeys, appropriate phasing. Zero broken existing-file refs.
