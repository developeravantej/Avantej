# Doc Consistency Audit — Web Modularity Refactor

Audit date: 2026-04-24. Plan: `zplan/04-24_11-22_web-modularity-refactor/plan/plan.md`.

## Findings

### HIGH-1: Two cited file paths are wrong
Plan §6 Impact references these paths literally; they do NOT exist at the cited locations:

- `components/access-control/EnhancedPermissionMatrix.tsx` — actual:
  `apps/web/src/components/access-control/permission-matrix/EnhancedPermissionMatrix.tsx`
  (under a `permission-matrix/` subfolder).
- `components/access-control/permissions-tab.tsx` — actual:
  `apps/web/src/components/pages/access-control/permissions-tab.tsx`
  (under `components/pages/`, not `components/`).

Phase 6C task list and §6 "Callers to trace" both use the wrong paths. Fix before Phase 6C kicks off; grep verification in Task 6C.4 will otherwise fail and mislead implementers.

### HIGH-2: Phase 5 table list references a non-existent `trainers` columns file
Phase 5 Task 5.1 enumerates 15 `columns.tsx` files including `trainers`. There is NO `apps/web/src/components/tables/trainers/` directory — verified via glob (zero matches). Trainer data lives in `routes/_authenticated/dashboard/_layout/trainers/view.tsx` (the mega-file). The plan conflates "table refactor" with "mega-file split (Phase 6B)". Either drop `trainers` from the Phase 5 list or add a note that the column builder adoption for trainers happens INSIDE Phase 6B when `TrainerTable.tsx` is extracted.

All other 14 entries in the Phase 5 list resolve to real files.

### MEDIUM-1: Line counts verified accurate
`wc -l` actuals vs plan claims:
- `add-appointment-modal.tsx`: 2743 ✓ (matches)
- `installments-page.tsx`: 1357 ✓
- `trainers/view.tsx`: 1334 ✓
- `EnhancedPermissionMatrix.tsx`: could not measure (wrong path in plan; see HIGH-1).

Also verified: `lib/amount.ts` (9), `lib/currency.ts` (25), `hooks/useDebounce.ts` (28), `hierarchical-branch-form.tsx` (986 lines — plan scope note §8 "Deferred" correctly flags it as ongoing).

### MEDIUM-2: 299 toast.error count verified — no drift
Fresh Grep: **299 occurrences across 90 files** — matches plan §1 exactly. Per-file counts cited in Phase 2 top-10 also match (e.g., add-appointment-modal: 17, hierarchical-branch-form: 17, branch/view: 23, promotions/view: 11, trainers/view: 10, installments-page: 9, expenses/view: 9, purchase-orders/view: 9, tax-rates: 9, transfers-tab: 9). Good signal that the audit is recent.

### LOW-1: Sibling-session gating verified OK
All four referenced sibling sessions exist at cited paths:
- `zplan/04-23_15-31_frontend-table-consolidation` — still IN-PROGRESS (no `Done_` prefix). Phase 5 gating is correctly active.
- `zplan/04-23_12-38_installment-enhancements` — still IN-PROGRESS. Phase 6D gating is correctly active.
- `zplan/Done_04-24_14-00_form-standardization` — Done ✓
- `zplan/Done_04-21_16-55_remove-walk-in-customers` — Done ✓

### LOW-2: `zPercentageBp` vs `lib/promotions.ts` — separate concerns, not duplication
MEMORY.md notes `apps/web/src/lib/promotions.ts` exports `encodePromotionValue(type, userInput): number` (multiplies by 100, stores basis points for percentage OR cents for fixed_amount). Plan §3.3 introduces `zPercentageBp = z.number().int().min(0).max(10_000)` — a zod schema validating an already-encoded basis-points integer. These are complementary, not duplicative:
- `encodePromotionValue` encodes user string → integer.
- `zPercentageBp` validates integer shape in form schemas.
No conflict. INFO-only note: plan should cross-reference `lib/promotions.ts` in §3.3 so migrators know the existing encoder is the intended producer for this validator.

### LOW-3: Plan §6 link typo
§6 references `[feedback_stale_permission_cache](../../../C:/Users/user/.claude/projects/C--Project-Avantej/memory/feedback_stale_permission_cache.md)` — a Windows absolute path inside a relative-link prefix. Broken in any markdown viewer. Replace with a plain callout to MEMORY.md or a proper absolute path.

### INFO: No TBD/???/NEEDS DECISION markers found
Open Questions §8 uses "Recommendation:" format with three items awaiting user decision — all clearly labeled, none ambiguous. No stray TODO/FIXME/???/TBD markers detected in plan.md.

## Summary
- **HIGH**: 2 (wrong access-control paths; trainers listed under Phase 5 but no `tables/trainers/`)
- **MEDIUM**: 2 (line counts OK; toast count OK — confirming, not flagging)
- **LOW**: 3
- **CRITICAL**: 0

Recommend a plan-maintenance pass before Phase 5/6 begins. All grep-verifiable metrics in the plan are currently accurate.
