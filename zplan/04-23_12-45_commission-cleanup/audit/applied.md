# Audit Apply: 04-23_12-45_commission-cleanup (Pass 2)

**Applied:** 2026-04-23 13:35
**Source report:** `gaps/GAPS.md` (generated 2026-04-23 13:30 by `/audit-swarm` pass 2)
**Plan file:** `plan/plan.md`
**Freshness:** ok — plan mtime precedes gaps mtime

> **Note:** Pass 1's `applied.md` was overwritten. See git history for prior apply-pass audit trail. This session uses `/audit-swarm` output instead of `/audit`'s `audit/report.md`.

## Summary
| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 0 |
| Shape/value auto-fixed | 1 (getMyCommissions mock) |
| Structural sections updated | 1 (§9 task table) |
| Housekeeping items flagged (not in-session) | 1 (orphaned migration) |
| TODOs injected | 0 |
| Deferred (execution-pending) | 10+ |

## Changes

### Auto-fixes
- **§3.8 mock-client shapes** — replaced `getMyCommissions: vi.fn().mockResolvedValue([])` → `getMyCommissions: vi.fn().mockResolvedValue({ splits: [], totalAmount: 0 })`. Finding: C2 api-surface. Service at `packages/services/src/commission-splits.service.ts:143` returns `{ splits, totalAmount }`, not an array.
- **§9 Task Reference table** — inserted new row `| 1.2 | Create directory apps/web/src/__tests__/pages/commissions/ | 1 | 5m |`. Renumbered old `1.2` ("Verify existing commission tests still pass") to `1.3`. Finding: C3 doc-consistency (table was stale after pass-1 audit-apply added task 1.2 to the Phase 1 section but didn't sync the flat task list).

### Flagged but deferred (out of session-path boundary)
- **Orphaned migration `0014_expenses_currency_myr.sql`** — file exists at `packages/db/src/migrations/tenant/` but is never registered in `meta/_journal.json`. The `/audit-apply` skill forbids modifying source outside the session path, so the file cannot be deleted in this pass. A note has been added to §7.3 flagging it for a separate housekeeping PR. Finding: C1 schema-drift.
  - **To resolve manually:** run `rm packages/db/src/migrations/tenant/0014_expenses_currency_myr.sql` and commit as its own housekeeping change.

### Deferred — plan-correct, pending `/execute`
These items are correctly described in the plan and will be addressed during phase execution:
1. **H1 type-safety: UUID_RE extraction** — Phase 4.2 must define `const UUID_RE` at module scope before simplifying `markPaidSchema`.
2. **H3 schema-drift: listCommissionLedger earnedAt swap** — Phase 5.2.
3. **M1/M2 type-safety: Row type fields** — Phase 5.3 adds `earnedAt` to `CommissionLedgerRow` and `MyCommissionRow`.
4. **M3 type-safety: markPaidSchema cleanup** — Phase 4.2.
5. **M4 type-safety: Pre-existing `as any` casts** — out of scope; follow-up sprint.
6. **H2 api-surface: mine-tab `as any` cast** — linked to C2; fixing the mock shape (done here) is the in-session deliverable.
7. **Test coverage (all)** — all test files are correctly scheduled in Phases 2–6.
8. **Bulk void sequential loop** — Phase 3.2.

## Pass 1 → Pass 2 summary
| Pass 1 Critical | Status after pass 1 audit-apply | Status after pass 2 |
|-----------------|----------------------------------|---------------------|
| C1: test dir missing | Resolved — task 1.2 added to Phase 1 | ✓ (§9 table synced here) |
| C2: mock-client 5 missing methods | Plan correct; execution pending | ✓ (awaiting Phase 1.1) |
| C3: backend test false-green | Resolved — Phase 5.1 expanded | ✓ |
| C4: CommissionLedgerRow earnedAt | Plan correct; execution pending | ✓ (awaiting Phase 5.3) |
| C5: MyCommissionRow earnedAt | Plan correct; execution pending | ✓ (awaiting Phase 5.3) |
| C6: markPaidSchema extra fields | Plan correct; execution pending | ✓ (awaiting Phase 4.2) |
| C7: MODIFY/CREATE list conflation | Resolved — split in all 3 phases | ✓ |

Pass 2 surfaced 3 new issues; all three are now addressed (2 auto-fixed, 1 flagged for housekeeping PR).

## Next steps
1. **Housekeeping (outside this session):** `rm packages/db/src/migrations/tenant/0014_expenses_currency_myr.sql` and commit as a standalone change.
2. **Re-run `/audit-swarm zplan/04-23_12-45_commission-cleanup`** to confirm no remaining plan defects. Expect: 0 CRITICAL, 0 HIGH actionable (all remaining HIGH items are execution-pending with correct plan descriptions).
3. **Ready for `/execute`** — begin Phase 1.1 (mock-client extension per §3.8 corrected shapes).
