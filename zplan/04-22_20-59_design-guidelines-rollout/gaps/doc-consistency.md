# Doc Consistency Audit
**Session:** 04-22_20-59_design-guidelines-rollout
**Findings:** 10 (0 critical · 3 high · 4 medium · 3 low · 0 info)

---

## Findings

### [HIGH] CommissionStatusBadge line range wrong for all-tab.tsx
**Plan claims:** Phase 4.F.5 — "Delete both copies of `CommissionStatusBadge` (lines 42–67 and 91–112)." Implies the first range (42-67) belongs to `all-tab.tsx` and the second (91-112) to `mine-tab.tsx`.
**Actual:** `mine-tab.tsx` has `CommissionStatusBadge` at lines **42–67** (correct for mine-tab). `all-tab.tsx` has `CommissionStatusBadge` at lines **91–116** (plan says 91–112, off by 4). The plan's description implies the ranges but doesn't label which file gets which — a developer executing 4.F.5 will be confused.
**File:** `apps/web/src/components/pages/commissions/all-tab.tsx:91–116`, `apps/web/src/components/pages/commissions/mine-tab.tsx:42–67`
**Fix:** In Phase 4.F.5, clarify: `mine-tab.tsx` lines 42–67, `all-tab.tsx` lines 91–116 (not 91–112).

---

### [HIGH] customer-step.tsx walk-in avatar is shared with member (not walk-in-only)
**Plan claims:** §3.3 J5, §3.5, Phase 3.3 — "Walk-in search-result shows `bg-primary/10`" at `customer-step.tsx:179`. Implies there's a walk-in-specific avatar at that line.
**Actual:** Line 179 uses `bg-primary/10` for ALL search results (both member and walk-in) rendered in a single shared `filtered.map()` loop. There is no conditional branch distinguishing member vs walk-in avatar at that point. The plan correctly identifies the bug, but the framing "walk-in avatar at line 179" is imprecise — it is the shared avatar for all results. The fix requires adding a conditional on `r.type`.
**File:** `apps/web/src/components/pos/customer-step.tsx:172–196`
**Fix:** Clarify in Phase 3.3 task description: "The avatar div at line 179 currently applies `bg-primary/10` to both member and walk-in; add a conditional `r.type === 'walk-in'` check to apply `bg-brand-secondary-2 text-brand-primary-1` for walk-ins."

---

### [HIGH] §8.2 open question is already resolvable — Biome does NOT support className restriction
**Plan claims:** §8.2 — "Question: Does our Biome version support className-literal pattern restriction?" — marked as open.
**Actual:** The project uses Biome **v2.4.7**. The Biome configuration schema at that version has `noRestrictedGlobals`, `noRestrictedImports`, and `noRestrictedTypes`, but no `noRestrictedClasses` or className-pattern restriction rule. This is resolvable from the codebase right now: the answer is **No**, and the fallback `tools/lint-classes.ts` custom script will be required.
**File:** `biome.json` (project root), `node_modules/@biomejs/biome/configuration_schema.json`
**Fix:** Close §8.2 with the finding: "Biome 2.4.7 has no className-restriction rule. Use `tools/lint-classes.ts` via Husky pre-commit as the Phase 2 enforcement mechanism."

---

### [MEDIUM] sales/view columns.tsx status map line range slightly off
**Plan claims:** Phase 4.F.1 — "Replace status map at `columns.tsx:182–189`".
**Actual:** The `statusStyles` Record is at lines 182–187 (6 lines, not 8). The full status-cell block including the `const status` extraction and return spans lines 181–193. The range 182–189 partially overlaps but does not accurately bound the entire inline implementation.
**File:** `apps/web/src/components/tables/sales/view/columns.tsx:180–193`
**Fix:** Update Phase 4.F.1 reference to lines ~180–193 to cover the full inline status cell.

---

### [MEDIUM] payment/view columns.tsx mode map line range slightly off
**Plan claims:** Phase 4.F.8 — "Replace mode map at `columns.tsx:167–176`".
**Actual:** The `modeStyles` Record spans lines 167–172; the full mode-cell block with return spans lines 165–182. The range 167–176 correctly includes the Record definition but misses the return block (lines 173–182) that also needs changing.
**File:** `apps/web/src/components/tables/payment/view/columns.tsx:165–182`
**Fix:** Update Phase 4.F.8 reference to lines ~165–182.

---

### [MEDIUM] Phase 5 dependencies on 4.F and 4.H are not strict prerequisites
**Plan claims:** Phase 5 "Dependencies: Phase 0; Phase 4.F (commissions refactor); Phase 4.H (attendance refactor)."
**Actual:** Phase 5.1 (commission bulk-approve dialog) is a NEW component (`bulk-approve-dialog.tsx`) that doesn't modify the existing commissions tables — it only calls a mutation. It does NOT require Phase 4.F to complete first; 4.F is only needed to ensure `CommissionStatusBadge` is canonical before the dialog component imports it. Similarly, Phase 5.2 (attendance anti-duplicate) works on the check-in flow, not the table refactored in 4.H. Both Phase 5 tasks can proceed in parallel with Phase 4.F/4.H — the dependency is logical (shared component availability) rather than strict ordering.
**File:** `plan.md:§5 Phase 5` (dependency block)
**Fix:** Change Phase 5 dependency note to: "Phase 0 (primitives). Soft dependency on Phase 4.F for StatusBadge availability in dialog; can start in parallel but must merge after 4.F. Phase 4.H is NOT a prerequisite for 5.2."

---

### [MEDIUM] §9 Appendix "the 13" data-table paths — table list partially wrong
**Plan claims:** §9 — "Tables (the 13): `apps/web/src/components/tables/{sales,payment,categories,brands,uom,user,rooms,transfer-orders,stock-requests,suppliers,role,cancelled-sales,branch}/view/data-table.tsx`"
**Actual:** All 13 `data-table.tsx` files exist at those paths. However the appendix list counts 13 items but the plan body (§6.2, Phase 3.5) also references `components/tables/data-table.tsx` (a generic wrapper) as a NEW file to be created (Phase 3.6 task) — this generic file does not yet exist and is not in the §9 list. Additionally, `payouts/view/` directory exists but is not in the "13" (consistent with plan text, but the count "13+" in §1 overview is correct).
**File:** `apps/web/src/components/tables/` (directory)
**Fix:** Add a note to §9 clarifying that `components/tables/data-table.tsx` (the generic wrapper) is a new file to be created in Phase 3.6 and is distinct from the 13 existing per-domain data-tables.

---

### [LOW] app-sidebar.tsx line references in Phase 1.1 task description differ from §3.3 table
**Plan claims:** Phase 1.1 task says "(lines 110, 127, 153, 166, 170)". §3.3 table says the same five lines.
**Actual:** All five line references are correct per the current file: line 110 = `Package` for Membership, line 127 = `Calendar` for Class Slots, line 153 = `ShoppingCart` for Purchase Orders, line 166 = `Package` for Units of Measure, line 170 = `ShoppingCart` for Stock Movement. No discrepancy.
**File:** `apps/web/src/components/app-sidebar.tsx`
**Fix:** None needed — this is an info-only confirmation.

---

### [LOW] payment-step.tsx change-due div is at line 209 (exact match, no issue)
**Plan claims:** §1.1 and Phase 3.4 — "`pos/payment-step.tsx` (~line 209)" with hand-rolled green styling.
**Actual:** Line 209 has `<div className="flex items-center justify-between rounded-xl border-2 border-green-200 bg-green-50 px-5 py-4">`. Exact match including the green-200/green-50 inline styling. The `~` qualifier is appropriate; the actual `changeDueCents !== null` check starts at line 208.
**File:** `apps/web/src/components/pos/payment-step.tsx:208–217`
**Fix:** None — confirmed accurate. Can drop the `~` approximation marker since line 208 is precise.

---

### [LOW] branch/create.tsx console.log is at line 33 (exact match)
**Plan claims:** Phase 2.3 — "Per audit there's one in `branch/create.tsx:33`."
**Actual:** Line 33 has `console.log("Branch created successfully");` inside `handleSuccess()`. Exact match.
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/create.tsx:33`
**Fix:** None — confirmed accurate.

---

## TODO Markers Status

Three `<!-- TODO (audit): ... -->` markers are injected in the plan. None appear to have been resolved (no follow-up note, no strikethrough). Status:

1. **Line 43 (Scope-In section):** "`components/expenses/**` directory does not exist — expenses logic is inline in the route file; remove from scope or extract first." — **Unresolved.** The scope-in list still includes `components/expenses/**` which does not exist. This is a live inconsistency in the plan: the scope paragraph lists a non-existent directory. The task body (4.F.10) carries its own matching TODO. Resolution: remove `components/expenses/**` from the §1 Scope-In bullet and replace with "expenses UI lives in `routes/.../expenses/view.tsx` (inline)".

2. **Line 434 (Phase 4.F.10):** "`components/expenses/**` directory does not exist; all expenses UI is inline in the route file." — **Unresolved.** Consistent with TODO #1 above.

3. **Line 484 (Phase 5.1) and Line 553 (§6.5 blocking prerequisites):** "`commissions.bulkApprove` mutation does not exist." — **Unresolved.** This is a genuine blocker for Phase 5.1. The router candidates (`commission-splits.ts`, `category-commission.ts`) need grepping at Phase 5 scheduling time, and a backend task needs to be logged before 5.1 can be scheduled.

---

## Cross-Phase Dependency Assessment

- **Phase 2 → Phase 0:** Logical and correct. Biome rule (or custom script) can reference new primitives only after Phase 0 ships.
- **Phase 3 → Phase 0:** Correct. Phase 3 migrations consume `StatusBadge`, `EmptyState`, `StatusCallout`.
- **Phase 4 → Phase 0:** Correct. All per-page refactors import from Phase 0 primitives.
- **Phase 5 → Phase 0 + Phase 4.F + Phase 4.H:** Partially incorrect — see HIGH finding above. 4.F and 4.H are soft/parallel dependencies, not strict blockers.

---

## Summary

Ten findings across the plan. The most actionable are: (1) the `CommissionStatusBadge` line range in `all-tab.tsx` is wrong by 4 lines (HIGH, will confuse task executors); (2) the `customer-step.tsx` walk-in avatar framing is imprecise — the avatar at line 179 is shared across all result types, not walk-in-specific, requiring a note on the conditional logic needed; (3) §8.2 is already answerable from the codebase — Biome 2.4.7 lacks className restriction, so the fallback script is confirmed necessary. Three TODO markers remain unresolved and require action before Phase 4.F.10 and Phase 5.1 can be scheduled. All 13 data-table.tsx files in §9 are confirmed to exist. The cited line numbers for `payment-step.tsx` (change-due), `registered-page.tsx` (AVATAR_COLORS), `today-bookings.tsx` (StatusBadge + empty-state), `branch/create.tsx` (console.log), and `app-sidebar.tsx` (all five icon lines) are confirmed accurate.
