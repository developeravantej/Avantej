# Schema Drift Audit (Pass 2)
**Session:** zplan/04-23_12-45_commission-cleanup
**Findings:** 3 (1 critical · 1 high · 1 info)

## Findings

### [CRITICAL] Orphaned migration file `0014_expenses_currency_myr.sql` — not in journal
**Plan claims:** `0014_lively_jane_foster.sql` is the single migration that added `earnedAt` with its index.
**Actual:** Two files share the `0014` prefix:
1. `packages/db/src/migrations/tenant/0014_expenses_currency_myr.sql` — updates expense currency
2. `packages/db/src/migrations/tenant/0014_lively_jane_foster.sql` — Phase 1 commission system

The migration journal (`meta/_journal.json`) registers only `0014_lively_jane_foster` at index 14. The `0014_expenses_currency_myr.sql` file is **never registered** — it is an orphaned file on disk that has never been executed. Any future developer running `bun db:migrate` or inspecting the tenant migrations will encounter two files with the same prefix and may attempt to execute the orphaned one, corrupting the migration sequence.

**File:** `packages/db/src/migrations/tenant/0014_expenses_currency_myr.sql` (orphaned)
**Fix:** Delete `0014_expenses_currency_myr.sql` immediately. It is not tracked in the journal and should not exist alongside a registered `0014_` migration.

---

### [HIGH] `listCommissionLedger` still filters/sorts on `createdAt` — Phase 5.2 pending
**Plan claims:** Phase 5.2 will replace `commissionSplits.createdAt` → `commissionSplits.earnedAt` at lines 916, 920, 937.
**Actual:** `packages/services/src/commission-splits.service.ts:915-937` still uses `createdAt` in all three places. This is the expected pre-execution state — the plan's Phase 5.2 is the scheduled fix.
**File:** `packages/services/src/commission-splits.service.ts:916,920,937`
**Fix:** Execute Phase 5.2 per plan description.

---

### [INFO] Index name `commission_splits_earned_at_idx` verified correct
**Plan claims:** §7.3 cites index `commission_splits_earned_at_idx` from migration `0014_lively_jane_foster.sql`.
**Actual:** Migration line 135: `CREATE INDEX "commission_splits_earned_at_idx" ON "commission_splits" USING btree ("earned_at")` ✓. Schema line 96: `earnedAtIdx: index("commission_splits_earned_at_idx").on(table.earnedAt)` ✓. Sequence: 0013 → 0014 (lively_jane_foster) → 0015 is correct.
**File:** `packages/db/src/migrations/tenant/0014_lively_jane_foster.sql:135`
**Fix:** No action needed.

---

## Summary
Pass 2 surfaces one new CRITICAL finding not in the plan: an orphaned migration file `0014_expenses_currency_myr.sql` exists on disk but is not registered in the migration journal. It must be deleted to prevent confusion or accidental execution. The HIGH finding (listCommissionLedger still on createdAt) is the planned Phase 5.2 fix, not a regression. All schema entities (column names, nullability, index name, sequence) are verified correct.
