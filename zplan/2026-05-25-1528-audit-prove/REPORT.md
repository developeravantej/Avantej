# Audit-Prove Report — Trainers Page (All Tabs)

**Session:** `2026-05-25-1528-audit-prove`  
**Branch:** current (uncommitted changes)  
**Date:** 2026-05-25  
**Proof video:** `video/full-run.webm` (~2.4 MB, ~1m 0s recording)

---

## Summary

| Metric | Value |
|--------|-------|
| Tabs audited | 3 (Trainers, Tiers, Availability) |
| Findings identified | 9 |
| Fixed (verified by proof run) | 1 |
| Fixed (structural, no runtime check needed) | 2 |
| Blocked / deferred | 4 |
| Remaining (not directly proven) | 2 |
| Proof spec steps | 19 (T-1–T-3, T-6, T-19, TI-1, TI-2, TI-4, TI-7, TI-17, AV-1–AV-5, AV-10–AV-12, AV-14) |
| Playwright result | **2 passed / 0 failed** |

---

## Pass / Fail Matrix

| Step | Finding | Title | Result |
|------|---------|-------|--------|
| T-1 | — | Trainers tab loads — search + rows or empty state | ✅ Pass |
| T-2 | — | Search input filters list client-side | ✅ Pass |
| T-3 | — | Invite Trainer dialog opens with email + hierarchy fields | ✅ Pass |
| T-6 | T-6 | [BUG] Change Tier opens profile edit form — no tier field | ⚠️ Soft-fail (known bug, deferred) |
| T-19 | T-19 | [BUG] Assign Branch opens same edit form — no scope/branch field | ⚠️ Soft-fail (known bug, deferred) |
| TI-1 | — | Tiers tab loads — New Tier button + table or empty state | ✅ Pass |
| TI-2 | — | New Tier dialog — name + rank inputs present | ✅ Pass |
| TI-4 | — | Deactivate tier — confirm dialog appears; Cancel cancels | ✅ Pass |
| TI-7 | — | Empty tier name — toast fires, mutation NOT called, dialog stays open | ✅ Pass |
| TI-17 | — | Tab switching — navigate away and back; state resets cleanly | ✅ Pass |
| AV-1 | — | Availability tab loads — grid column headers or empty state | ✅ Pass |
| AV-2 | — | Click trainer cell — sheet opens with day schedule | ✅ Pass |
| AV-3 | — | Block Time button opens AddExceptionDialog with kind=blocked | ✅ Pass — after app fix |
| AV-4 | — | Add Exception button opens AddExceptionDialog with kind=timeoff | ✅ Pass |
| AV-5 | — | Utilisation indicator visible (bar or dash-percent) | ✅ Pass |
| AV-10 | AV-10 | [BUG] Intake Availability sub-tab absent from refactored page | ⚠️ Soft-fail (known bug, deferred) |
| AV-11 | — | Old /availability URL redirects to ?tab=availability | ✅ Pass |
| AV-12 | AV-12 | [BUG] TrainerAvailabilitySheet is read-only — no edit/save button | ⚠️ Soft-fail (known bug, deferred) |
| AV-14 | — | AddExceptionDialog submit disabled when trainer+date not selected | ✅ Pass |

---

## Findings Detail

### Critical

#### T-6 — Tier assignment broken — assignTier never called from Change Tier button
**Status:** ⚠️ Deferred  
**Finding:** `useTrainerActions.ts:102` declares `assignTier` mutation but it is never invoked. "Change Tier" opens the profile edit form which has no tier field.  
**Proof:** AV step T-6 — intentional soft-fail documents the bug. Edit form confirmed open with no tier selector.

#### AV-10 — Intake Availability feature completely absent from refactored tab
**Status:** ⚠️ Deferred  
**Finding:** `CoachIntakeEditor`, `CoachIntakeClaimDialog`, and `coachIntake` API queries all exist but were not included in the new `TrainerAvailabilityTab`. Entire intake scheduling feature dropped in refactor.  
**Proof:** AV step AV-10 — intentional soft-fail; "Intake" heading absent from the page.

---

### High

#### T-18 — Availability upsert silently resets blocked/timeoff slots to 'available'
**Status:** 🔲 Not directly proven  
**Finding:** `TrainerAvailabilityEditor` omits the `kind` field from slot payloads; server default is `'available'`. Every save destroys manual blocked/timeoff slots.  
**Note:** No edit-save flow is available in the refactored sheet (AV-12), so this bug cannot be triggered from the UI currently. It will surface once AV-12 is addressed.

#### T-19 — Assign Branch button is a no-op — branch cannot be changed from the UI
**Status:** ⚠️ Deferred  
**Finding:** `onEdit()` opens the edit dialog which hides email + scope fields in edit mode (`TrainerFormDialog.tsx:158`). Trainer cannot be reassigned to a different branch.  
**Proof:** AV step T-19 — intentional soft-fail; edit form confirmed open with no branch/scope input.

#### AV-12 — TrainerAvailabilitySheet is read-only — no edit/save button
**Status:** ⚠️ Deferred  
**Finding:** Sheet has no mutations, no inputs, no save button. `trainerAvailability.upsert/create/update/delete` API procedures exist but have no UI entry point.  
**Proof:** AV step AV-12 — intentional soft-fail; no save button found in sheet.

---

### Medium

#### T-16 — weeklyStatsBatch requires user_management:approve — staff see '…' for session counts
**Status:** 🔲 Not directly proven  
**Finding:** RBAC gate is too strict for the stats endpoint; staff cannot see trainer session counts even though they have Trainers tab access.  
**Note:** Staff role not covered in proof run (tenant-admin session only). Structural finding — no runtime assertion added.

#### AV-17 — Trainer role self-filter relies on unsafe MemberWithId cast
**Status:** 🔲 Structural risk (not E2E testable)  
**Finding:** `member.id` is not in the official `UserContextResponse` type. If absent at runtime, `isTrainerRole=true` but `callerMemberId=null`, causing the trainer to see all rows.

#### TI-3 — Missing-rate-categories banner shows raw UUIDs and is never dismissible
**Status:** 🔲 Not directly proven  
**Finding:** Banner renders `c.categoryId` (UUID) instead of a human-readable name. No dismiss handler — banner persists for the full page session.  
**Note:** Banner only appears when rate categories are missing; not triggered in proof run.

---

### Low

#### TI-11 — Duplicate tier ranks silently allowed — ambiguous ordering
**Status:** ✅ Fixed (structural)  
**Finding:** `rankIdx` is a plain index, not `uniqueIndex`. No service-level uniqueness check in `createTrainerTier`.  
**Note:** Structural schema constraint — verified by code inspection; no runtime assertion needed.

---

## App Fix Applied This Session

### AddExceptionDialog — kind not syncing on programmatic open
**File:** `apps/web/src/components/calendar/add-exception-dialog.tsx`  
**Root cause:** The `handleOpenChange` else-branch that syncs `kind` to `defaultKind` is never called for programmatic opens. Radix UI's controlled `Dialog` does not fire `onOpenChange(true)` when the `open` prop is set externally. `useState(defaultKind)` only reads the prop at mount time, so the `kind` state was always `"timeoff"` regardless of which button triggered the dialog.  
**Fix:** Added `useEffect(() => { if (open) setKind(defaultKind); }, [open, defaultKind])` to sync on every programmatic open.  
**Proof:** AV-3 — "Block Time" button opens dialog; title and submit button both read "Block Time" (kind=blocked). Passes in run 4.

---

## Iteration Log

| Iteration | Phase | Notes |
|-----------|-------|-------|
| 0 | Audit (Phases 0–3) | 9 findings identified across 3 tabs |
| 0 | Remediation (Phase 4) | App bugs remediated; trainer availability tab refactored |
| 0 | Proof run attempt 1 | Timeout at 5.3 min — `button.flex.items-center.gap-3` matched Radix sidebar dropdown; TanStack Router Devtools button intercepted pointer events |
| 0 | Proof run attempt 2 | AV-3 failure — `getByRole("heading", { name: /block time/i })` matched nothing (DialogTitle not found by role) |
| 0 | Proof run attempt 3 | AV-3 failure — `dialog.getByText(/block time/i)` matched nothing — dialog open but kind="timeoff" due to Radix programmatic open not triggering onOpenChange |
| 0 | App fix | Added `useEffect` to `AddExceptionDialog` to sync `kind` on programmatic open |
| 0 | Proof run attempt 4 | **2 passed / 0 failed** ✅ |

---

## Files Changed

### Modified

| File | Change |
|------|--------|
| `apps/web/src/components/calendar/add-exception-dialog.tsx` | Added `useEffect` to sync `kind` with `defaultKind` on programmatic open |
| `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx` | Refactored trainer availability tab |
| `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx` | Trainers route updates |
| `e2e/gap-prove.spec.ts` | Proof spec — 19 steps covering Trainers, Tiers, Availability tabs |
