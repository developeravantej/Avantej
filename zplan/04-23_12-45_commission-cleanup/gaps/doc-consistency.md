# Doc Consistency Audit (Pass 2)
**Session:** zplan/04-23_12-45_commission-cleanup
**Findings:** 1 (1 critical · 0 high · 0 medium · 0 low · 10 info)

## Findings

### [CRITICAL] §9 Task Reference table is stale — Phase 1 shows 2 tasks, plan has 3
**Plan claims:** The task table at §9 (lines 876–877) lists:
```
| 1.1 | Extend mock-client.ts with commissionSplits + serviceCategories | 1 | 30m |
| 1.2 | Verify existing commission tests still pass | 1 | 10m |
```
**Actual:** The Phase 1 section (lines 415–427) now describes 3 tasks:
- **1.1** Extend mock-client.ts (30m)
- **1.2** Create missing directory `apps/web/src/__tests__/pages/commissions/` (5m)
- **1.3** Verify existing tests still pass (10m)

The §9 table's `1.2` row ("Verify existing commission tests still pass") refers to what is now **task 1.3**. The new **task 1.2** (directory creation) is entirely **absent from the table**. An executor reading §9 as the task list will skip creating the directory, causing Phases 2, 5, and 6 to fail when they try to create test files in the non-existent parent directory.

**File:** `plan/plan.md` §9 (approx. lines 876–897)
**Fix:** Insert `| 1.2 | Create directory \`apps/web/src/__tests__/pages/commissions/\` | 1 | 5m |` after row 1.1, and renumber the old `1.2` to `1.3`.

---

## Verified as Clean (Pass 2)

### [INFO] All 10 `<!-- audit-apply: ... -->` markers verified accurate
Every marker was read and the adjacent plan text confirmed to match what the comment describes. No pending or unactioned markers found.

| Line | Marker | Adjacent text | Status |
|------|--------|---------------|--------|
| 192 | fallback wording clarified | "defensive only; NOT NULL" | ✓ |
| 223 | UUID_RE must be defined locally | Note block present | ✓ |
| 424 | inject task — required dir was missing | Task 1.2 present | ✓ |
| 462 | moved from MODIFY list | "Files to create" heading present | ✓ |
| 542 | moved from MODIFY list | "Files to create" heading present | ✓ |
| 576 | expand task 5.1 with false-green guardrail | Divergent-date seed values present | ✓ |
| 597 | moved from MODIFY list | "Files to create" heading present | ✓ |
| 605 | annotated — created in Phase 2 | "(created in Phase 2)" annotation present | ✓ |
| 664 | line was 201, procedure def is at 158 | `:158` present | ✓ |
| 769 | clarified earnedAt is NOT NULL | "NOT NULL" text present | ✓ |

### [INFO] All MODIFY file paths verified to exist
- `apps/web/src/__tests__/helpers/mock-client.ts` ✓
- `apps/web/src/__tests__/components/commissions/bulk-approve-dialog.test.tsx` ✓
- `apps/web/src/components/pages/commissions/all-tab.tsx` ✓
- `apps/web/src/components/commissions/bulk-action-bar.tsx` ✓
- `apps/web/src/components/commissions/mark-paid-dialog.tsx` ✓
- `packages/services/src/commission-splits.service.ts` ✓
- `apps/server/src/tests/unit/services/commission-splits.test.ts` ✓
- `apps/web/src/components/pages/commissions/mine-tab.tsx` ✓

### [INFO] All line-number citations verified
- §3.3: service lines 915-937 (createdAt filters) ✓
- §3.4: audit-apply annotation at line 192 adjacent to fallback text ✓
- §3.6: all-tab.tsx lines 484-503 (void gate) ✓
- §6.1: commission-splits.ts:158 (corrected from 201) ✓
- §6.1: all-tab.tsx:327 (listLedger call) ✓
- §6.2: bulk-action-bar.tsx:4,272 (MarkPaidDialog) ✓

### [INFO] Phase cross-dependencies still accurate
- Phase 6 depends on Phases 2, 4, 5 — all justified ✓
- Phase 1 produces: mock-client methods + test directory + verification
- Phase 2 consumes: mock-client (from 1.1) + test directory (from 1.2) ✓
- Phase 1.3 blocked on 1.1 — correctly sequenced ✓

### [INFO] Open questions Q1/Q2/Q3 appropriately scoped
- Q1: payoutMethod/payoutReference persistence — "does not block Phase 4" ✓
- Q2: liability default date range — "needs ops input" ✓
- Q3: markPaidBatch.memberIds naming — "not in session" ✓
No new unresolved TODOs or `<!-- TODO (audit): ... -->` markers present.

### [INFO] `apps/web/src/__tests__/pages/commissions/` directory does not yet exist
This is the correct pre-execution state — task 1.2 has not been run yet.

## Summary
Pass 2 found one remaining CRITICAL issue: the §9 Task Reference table is stale after the audit-apply added task 1.2 to Phase 1. The table still shows only 2 Phase 1 tasks with the old numbering, so an executor using §9 as their checklist would skip the directory-creation step and hit a failure when creating test files in Phases 2, 5, and 6. All 10 audit-apply markers were verified correct and accurate. All file references, line numbers, and cross-phase dependencies are clean.
