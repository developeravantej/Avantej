# Audit: trainer-selection-buy-flow

**Audited:** 2026-04-30 14:30
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 2 (soft) |
| Missing impact | 2 files with unlisted callers |
| Unresolved questions | 0 stray markers (5 items in Section 8, all explicitly resolved/deferred) |
| Execution state | not started |

---

## Findings

### Structural Completeness — 8/8

All required sections are present with substantive content:
1. Overview — problem, goals, success criteria, scope
2. Result — before/after in user terms (both customer and admin)
3. Technical Architecture — data flow diagram, schema change, API changes, key decisions table
4. User Journeys — 5 journeys, each with "Where it lives"
5. Phased Implementation — 4 phases, each delivering ≥1 journey
6. Impact & Breakage Analysis — changed tables, procedures, native files, deployment coupling
7. Cross-Cutting Concerns — error handling, testing, migration, rollback, performance
8. Open Questions / Risks — 5 items, all resolved/deferred with impact rating

---

### Broken References

All three "MISSING" files are **new files** correctly listed in the New Files table — their absence from the codebase is expected. No false broken refs in that bucket.

**Genuine soft broken ref — `SummaryRow` component:**
- The plan (Task 2.4) instructs: `<SummaryRow label="Preferred Trainer" value={state.preferredTrainerName} />`
- `SummaryRow` does not exist anywhere in `apps/native/`. The existing `review.tsx` renders summary items as raw `View`/`Text` JSX blocks (inline rows), not via a named helper component.
- Fix: Task 2.4 should reference inline JSX matching the existing pattern in `review.tsx` rather than a non-existent `<SummaryRow>` abstraction.

**CalendarRange icon comment (plan §3.3):**
- The plan says: `icon: CalendarRange, // from lucide-react (CalendarClock is not available in this version)` — this comment is wrong. `CalendarClock` IS available in the installed version (`calendar-clock.js` exists in `node_modules/lucide-react/dist/esm/icons/`). `CalendarRange` also exists. Minor comment inaccuracy; no runtime impact since `CalendarRange` is the chosen icon.

---

### Missing Impact

**`packageInstances.create` — unlisted caller:**
- Plan lists callers as: `Native pay.tsx`, `web instances-page.tsx`, `web assign-package-dialog.tsx`
- Not listed: `apps/native/app/(app)/dashboard/book-workout/review.tsx` — this file references `packageInstances` and is an active caller. Worth confirming it does not call `create` directly so the plan can state it is explicitly unaffected.

**`createPackageInstance` service — test file not listed:**
- `apps/server/src/tests/unit/services/package-instance.test.ts` imports `createPackageInstance` directly and will be affected by any signature or insert-object change.
- `apps/server/src/tests/helpers/db-mock.factory.ts` builds `package_instances` fixture objects; it may need `preferredTrainerId: null` after the schema column is added to avoid TypeScript errors.
- Neither file appears in the Impact & Breakage section.

**`pending-approvals-widget.tsx` — scope ambiguity:**
- Listed as a caller of `listPending` in the Impact table (correct).
- Phase 4 does not specify whether the widget should also render the preferred-trainer badge. It shows pending packages in a compact card. If `listPending` now returns `preferredTrainerName`, the widget receives the field but silently ignores it. This should be acknowledged as a deliberate omission or added as a sub-task.

---

### Unresolved Questions

No stray `TBD`, `TODO`, `???`, `open question`, `to decide`, `decide later`, or `unresolved` markers found in `plan/plan.md`. Section 8 lists 5 open questions, each with an explicit `Status` of "Deferred", "Out of scope for v1", or "Handle gracefully". All risks have impact ratings.

---

### Execution State

| Artifact | Present | Notes |
|----------|---------|-------|
| `execute/log.md` | No | `/execute` has not been run |
| `research/brief.md` | No | Research phase not done (plan appears self-contained) |
| `chrome-test/plan.md` | No | Browser test plan not written |
| `chrome-test/results.md` | No | Not tested |
| `prompts/` | No | Handoff prompts not generated |

The plan is in "written, not yet executed" state.

---

### Architecture Validation (items confirmed correct)

- `packageInstances.listPending` exists at line 841 of `packages/api/src/routers/package-instances.ts`
- `assignedTrainerId` exists on `package_instances` schema (line 62), confirming the pattern the plan mirrors for `preferredTrainerId`
- `defaultTrainerMemberId` prop already exists on `assign-trainer-drawer.tsx` (lines 42, 53, 58, 63, 65) — Phase 4 Task 4.2 is correct: only `approvals.tsx` needs to pass it
- `schedulingType: "appointment" | "class_slot"` exists in `PurchaseFlowState` (line 17 of `purchase-flow-context.tsx`) — conditional nav logic in Task 2.3 is valid
- `members.list` accepts `role: "trainer"` and `status: "active"` filters — confirmed
- `trainerAvailability.list({ organizationId, trainerId })` — exists, matching the plan's call signature
- `reset()` function exists in `purchase-flow-context.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/` directory already exists (has `tiers.tsx`, `view.tsx`) — new `availability.tsx` drops in cleanly
- `CalendarRange` is available in the installed lucide-react version

---

## Priority Actions

1. **[Medium] Fix `SummaryRow` reference in Task 2.4** — Replace `<SummaryRow>` with inline JSX matching `review.tsx`'s existing `View`/`Text` row pattern. A non-existent component will either confuse the implementer or cause them to silently introduce an undocumented abstraction.

2. **[Low] Add test files to Impact table** — Add `apps/server/src/tests/unit/services/package-instance.test.ts` and `apps/server/src/tests/helpers/db-mock.factory.ts` to Section 6 with note that mock factory objects for `package_instances` rows may need `preferredTrainerId: null` after the schema change.

3. **[Low] Clarify `pending-approvals-widget.tsx` scope** — State explicitly in Phase 4 whether the widget should show the preferred-trainer badge or intentionally omit it (it renders compact cards, not action rows).

4. **[Trivial] Fix CalendarClock comment** — Remove or correct the parenthetical `(CalendarClock is not available in this version)` in Task 3.3; `CalendarClock` does exist in the installed lucide-react.

---

## Status Rationale

`needs-attention` rather than `critical` because all 8 structural sections are complete, all key API patterns and symbols were confirmed to exist in the codebase, and the 3 new files are correctly classified as new. The two issues (`SummaryRow` pointing to a non-existent component, 2 unlisted callers) are implementation guidance gaps, not architectural flaws. The plan can proceed to `/execute` after the `SummaryRow` task is corrected.
