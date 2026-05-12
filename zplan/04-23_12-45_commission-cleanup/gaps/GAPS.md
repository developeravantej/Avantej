# Swarm Audit — GAPS.md (Pass 2)
**Session:** zplan/04-23_12-45_commission-cleanup
**Run at:** 2026-04-23T13:30:00Z
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 18 (3 critical · 3 high · 4 medium · 0 low · 8 info)

> **Context:** This is pass 2, run after `/audit-apply` fixed 10 items from pass 1. Pass 1 CRITICAL items C1–C7 are resolved or correctly planned. Three new issues surfaced, plus the pre-existing HIGH items that are plan-described-and-pending-execution.

---

## Priority Fix Order

### P1 — Critical (fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| C1 | schema-drift | Orphaned migration `0014_expenses_currency_myr.sql` exists on disk but is NOT in the journal — risks accidental execution or sequence confusion | `packages/db/src/migrations/tenant/0014_expenses_currency_myr.sql` | **Delete the file.** It was never registered and must not coexist with `0014_lively_jane_foster.sql`. |
| C2 | api-surface | `getMyCommissions` mock shape in §3.8 is `[]` (array) but actual service returns `{ splits, totalAmount }` (object) — mine-tab tests written against the plan mock will silently validate the wrong data shape | `plan/plan.md §3.8` | Update mock to `vi.fn().mockResolvedValue({ splits: [], totalAmount: 0 })` |
| C3 | doc-consistency | §9 Task Reference table still shows Phase 1 with 2 rows (`1.1`, `1.2`) but plan now has 3 tasks — task 1.2 (create directory) is absent; old `1.2` is now `1.3` | `plan/plan.md §9 lines 876–877` | Insert `\| 1.2 \| Create directory \`apps/web/src/__tests__/pages/commissions/\` \| 1 \| 5m \|`; renumber old `1.2` → `1.3` |

---

### P2 — High (fix before executing phases)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| H1 | type-safety | `UUID_RE` referenced in the simplified `markPaidSchema` (§3.5) but not yet defined at module scope in `mark-paid-dialog.tsx` — Phase 4.2 will fail `check-types` if the constant isn't extracted before the schema is simplified | `apps/web/src/components/commissions/mark-paid-dialog.tsx:41-43` | Phase 4.2: add `const UUID_RE = /^[0-9a-f]{8}-.../i;` at module scope before any schema definition |
| H2 | api-surface | `mine-tab.tsx:85` uses `as any` cast that masks the `getMyCommissions` return type — silently converts both `[]` and `{splits:[]}` to `[]`, making mine-tab tests pass regardless of mock shape | `apps/web/src/components/pages/commissions/mine-tab.tsx:85` | Fix C2 first (correct mock shape); then mine-tab tests become meaningful; cast can be removed in a follow-up |
| H3 | schema-drift | `listCommissionLedger` still filters/sorts on `createdAt` — Phase 5.2 pending execution | `packages/services/src/commission-splits.service.ts:916,920,937` | Execute Phase 5.2 (plan correctly describes the fix) |

---

### P3 — Medium (execution-pending items — plan describes fix correctly)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| M1 | type-safety | `CommissionLedgerRow` missing `earnedAt` field — Phase 5.3 pending | `apps/web/src/components/pages/commissions/all-tab.tsx:40-61` | Execute Phase 5.3 |
| M2 | type-safety | `MyCommissionRow` missing `earnedAt` field — Phase 5.3 pending | `apps/web/src/components/pages/commissions/mine-tab.tsx:13-28` | Execute Phase 5.3 |
| M3 | type-safety | `markPaidSchema` still has `payoutMethod` + `payoutReference` — Phase 4.2 pending | `apps/web/src/components/commissions/mark-paid-dialog.tsx:35-45` | Execute Phase 4.2 |
| M4 | type-safety | 4 pre-existing `as any` casts in commission pages — `mine-tab.tsx:85` is highest priority (linked to C2) | `all-tab.tsx:279,342,343` · `mine-tab.tsx:85` | Out of scope this session; follow-up sprint |

---

### P4 — Low / Info

**All items from test-coverage are plan-correct, execution-pending (rated HIGH in test-coverage lens but downgraded here because the plan correctly describes every fix):**
- mock-client.ts missing 5 methods → Phase 1.1
- Backend `listCommissionLedger` earnedAt test missing (false-green guardrail added) → Phase 5.1
- Test directory `apps/web/src/__tests__/pages/commissions/` not yet created → Phase 1.2
- `all-tab.test.tsx`, `mine-tab.test.tsx`, `liability-tab.test.tsx`, `mark-paid-dialog.test.tsx` not yet created → Phases 2–6
- `mark-paid-dialog.tsx` still has removed fields → Phase 4.2
- `bulk-approve-dialog.test.tsx` missing void test cases → Phase 3.1

**Scalability (all INFO — plan correct):**
- Bulk void sequential loop → Phase 3.2 (planned, not a regression)
- All indexes, pagination caps, idempotency, query invalidation verified ✓

**API surface (all INFO):**
- `listLedger` at line 158 ✓; all 7 procedures verified ✓; `serviceCategories.list` ✓

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 1 (new) | 1 (pending Phase 5.2) | 0 | 0 | 1 | ⚠ New CRITICAL: orphaned migration |
| api-surface | 1 (new) | 1 | 0 | 0 | 3 | ⚠ New CRITICAL: mock shape wrong |
| test-coverage | 0 | 0 | 0 | 0 | 8+ | ✅ Plan correct; execution pending |
| doc-consistency | 1 (new) | 0 | 0 | 0 | 10 | ⚠ §9 table stale |
| type-safety | 0 | 1 | 4 | 0 | 0 | ⚠ UUID_RE + pending Phase 4/5 |
| scalability | 0 | 0 | 0 | 0 | 8 | ✅ Clean |

---

## Pass 1 → Pass 2 Improvement

| Pass 1 Critical | Pass 2 Status |
|-----------------|---------------|
| C1: test directory missing | ✅ Resolved — task 1.2 added to Phase 1; §9 table stale (new C3) |
| C2: mock-client missing 5 methods | ✅ Plan describes fix; execution pending |
| C3: backend test false-green risk | ✅ Resolved — Phase 5.1 expanded with seed data |
| C4: CommissionLedgerRow missing earnedAt | ✅ Plan describes fix (Phase 5.3); now MEDIUM |
| C5: MyCommissionRow missing earnedAt | ✅ Plan describes fix (Phase 5.3); now MEDIUM |
| C6: markPaidSchema extra fields | ✅ Plan describes fix (Phase 4.2); now MEDIUM |
| C7: MODIFY/CREATE list conflation | ✅ Resolved — all three phases split correctly |

**New findings in pass 2:** orphaned migration (C1), `getMyCommissions` mock shape wrong (C2), §9 table stale (C3).

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| C1: delete orphaned migration | 1 file deletion | ~50 | Bash rm |
| C2: fix getMyCommissions mock in plan | plan/plan.md §3.8 | ~150 | One Edit call |
| C3: §9 table update | plan/plan.md §9 | ~200 | Insert row + renumber |
| H1: UUID_RE constant (at execution) | mark-paid-dialog.tsx | ~100 | One line add |
| All pending phases | 12+ files | ~6,000+ | Main execution work |

---

## Auto-fixable findings

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| 1 | doc-consistency | §9 table missing task 1.2 and has wrong `1.2` label | `plan/plan.md` §9 approx. line 877 | Insert new row for `1.2` (Create directory, Phase 1, 5m); change old `1.2` → `1.3` |
| 2 | api-surface | `getMyCommissions` mock returns `[]` instead of `{ splits: [], totalAmount: 0 }` | `plan/plan.md` §3.8 | Replace `getMyCommissions: vi.fn().mockResolvedValue([])` with `vi.fn().mockResolvedValue({ splits: [], totalAmount: 0 })` |
