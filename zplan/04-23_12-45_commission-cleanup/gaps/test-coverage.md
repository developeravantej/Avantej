# Test Coverage Re-Audit
**Session:** zplan/04-23_12-45_commission-cleanup
**Plan version:** Phase 1 now has 3 tasks (1.1, 1.2, 1.3)
**Date:** 2026-04-23
**Status:** All Phase 1 tasks remain OUTSTANDING

## Summary
Since the initial audit, NO code changes have been executed. The plan remains unchanged and all previously-identified gaps remain. Phase 1 (mock-client extension + directory creation + verification) has NOT been started.

---

## Item Checklist (What was Previously Outstanding)

### [CRITICAL] 1.1 — Extend `mock-client.ts` with 5 missing `commissionSplits` methods
**Status:** OUTSTANDING (Phase 1 execution pending)
**Previous finding:** CRITICAL
**Re-audit check:** `apps/web/src/__tests__/helpers/mock-client.ts` still has only:
```ts
commissionSplits: {
  approve: vi.fn().mockResolvedValue({}),
  void: vi.fn().mockResolvedValue({}),
}
```
Missing: `listLedger`, `getMyCommissions`, `markPaid`, `markPaidBatch`, `liabilitySummary`
**Plan describes fix?** YES — §3.8 provides exact shapes
**Rating:** HIGH (plan correctly describes all 5 methods with shapes; execution pending)

---

### [CRITICAL] 5.1 — Backend test for `listCommissionLedger` `earnedAt` filtering
**Status:** OUTSTANDING (Phase 5 execution pending)
**Previous finding:** CRITICAL (false-green guardrail)
**Re-audit check:** `apps/server/src/tests/unit/services/commission-splits.test.ts` line 210 test "filters via earnedAt range" tests `liabilitySummary`, NOT `listCommissionLedger`. No test exists that:
- Seeds splits with divergent `earnedAt` vs. `createdAt` dates
- Asserts `listCommissionLedger` filters by `earnedAt` (not `createdAt`)

The test would currently fail against the current code (which filters `createdAt`), but the plan Phase 5.1 description (lines 562-575) correctly specifies the false-green guardrail: "if they match, the test passes against both the buggy `createdAt` code and the fixed `earnedAt` code — false-green."

**Plan describes fix?** YES — §5.1 explicitly seeds divergent dates and expects splits 2+3, not 1+2
**Rating:** HIGH (plan correctly identifies the false-green risk and describes mitigation; execution pending)

---

### 1.2 — Create missing directory
**Status:** OUTSTANDING (Phase 1 execution pending)
**Re-audit check:** Directory `apps/web/src/__tests__/pages/commissions/` does NOT exist
**Plan describes fix?** YES — Task 1.2 says "Create the missing test directory ... parent directory does not exist"
**Rating:** HIGH (plan correctly identifies requirement; directory not yet created)

---

### 1.3 — Verify existing tests still pass
**Status:** CANNOT EXECUTE (depends on Phase 1.1 completion)
**Re-audit check:** Cannot run `bun test src/__tests__/components/commissions/` until mock-client is extended
**Plan describes check?** YES — Task 1.3 says "Verify existing ... still passes after the mock-client extension. Run: `cd apps/web && bun test src/__tests__/components/commissions/`."
**Rating:** HIGH (plan correctly identifies verification step; blocked on 1.1)

---

### [HIGH] 2.1 — Write failing test "Void not rendered on paid rows"
**Status:** OUTSTANDING (Phase 2 execution pending)
**Re-audit check:** `all-tab.test.tsx` does not exist
**Plan describes fix?** YES — §2.1 provides exact test structure and assertions
**Rating:** HIGH (plan correct; file not yet created)

---

### [HIGH] 3.1 — Extend bulk-approve-dialog.test.tsx with void test cases
**Status:** OUTSTANDING (Phase 3 execution pending)
**Re-audit check:** `apps/web/src/__tests__/components/commissions/bulk-approve-dialog.test.tsx` (lines 20–52) only tests approve flow. No tests for:
- "Bulk void shows success toast when all succeed"
- "Bulk void shows partial-failure toast when some fail"

**Plan describes fix?** YES — §3.1 specifies exact test cases with mock setup
**Rating:** HIGH (plan correct; test cases not yet added)

---

### [HIGH] 4.1 — Write mark-paid-dialog tests
**Status:** OUTSTANDING (Phase 4 execution pending)
**Re-audit check:** `mark-paid-dialog.test.tsx` does not exist
**Plan describes fix?** YES — §4.1 specifies 3 test cases:
1. "Dialog renders only Payout ID field"
2. "Submitting with blank payoutId calls markPaid with correct args"
3. "Submitting with invalid UUID blocks submission"

**Rating:** HIGH (plan correct; file not yet created)

---

### [HIGH] 4.2 — Remove `payoutMethod` and `payoutReference` from mark-paid-dialog
**Status:** OUTSTANDING (Phase 4 execution pending)
**Re-audit check:** `mark-paid-dialog.tsx` still contains:
- Line 129–155: `payoutMethod` field + Select
- Line 157–173: `payoutReference` field + Input

**Plan describes fix?** YES — §3.5 specifies exact changes: remove both fields, keep `payoutId`
**Rating:** HIGH (plan correct; component not yet edited)

---

### [MEDIUM] 5.3–5.4 — Update frontend Date columns to show `earnedAt`
**Status:** OUTSTANDING (Phase 5 execution pending)
**Re-audit check:** `all-tab.tsx` still renders `createdAt` (plan notes it must change to `earnedAt` or fallback to `createdAt`); `mine-tab.tsx` similarly unchanged
**Plan describes fix?** YES — §3.4 specifies column changes and fallback logic for both pages
**Rating:** HIGH (plan correct; frontend columns not yet updated)

---

### [MEDIUM] 6.1–6.3 — Page-level happy-path tests
**Status:** OUTSTANDING (Phase 6 execution pending)
**Re-audit check:**
- `all-tab.test.tsx` does not exist (needed for tests in §6.1)
- `mine-tab.test.tsx` does not exist (needed for tests in §6.2)
- `liability-tab.test.tsx` does not exist (needed for tests in §6.3)

**Plan describes fix?** YES — §6 specifies exact test cases for each page
**Rating:** HIGH (plan correct; test files not yet created)

---

## Execution Status by Phase

| Phase | Task | Status | Plan Correct? | Rating |
|-------|------|--------|---------------|--------|
| 1.1 | Extend mock-client | NOT STARTED | ✓ YES | HIGH |
| 1.2 | Create directory | NOT STARTED | ✓ YES | HIGH |
| 1.3 | Verify tests | BLOCKED (on 1.1) | ✓ YES | HIGH |
| 2.1–2.3 | Per-row Void gate | NOT STARTED | ✓ YES | HIGH |
| 3.1–3.3 | Bulk void partial-fail | NOT STARTED | ✓ YES | HIGH |
| 4.1–4.4 | MarkPaidDialog cleanup | NOT STARTED | ✓ YES | HIGH |
| 5.1–5.4 | earnedAt alignment | NOT STARTED | ✓ YES | HIGH |
| 6.1–6.4 | Page happy-path tests | NOT STARTED | ✓ YES | HIGH |

---

## Assessment

### Plan Quality
The plan is **well-structured and detailed**:
- Every outstanding item has a clear description of the required change
- False-green guardrails are explicitly called out (Phase 5.1)
- Test fixtures and assertion patterns are provided with line numbers
- Dependencies between phases are correctly documented
- Rollback strategy is defined (git revert per phase)

### Execution Status
**All work remains pending.** The codebase has not advanced since the initial audit. This is expected for a plan that has just been created (session created 2026-04-23 12:45).

### Risk Assessment
- **No plan defects identified** — Phase 1 tasks are well-described and sufficient to unblock all downstream phases
- **Execution sequencing is critical** — Phase 1.1 (mock-client) must complete before any test file is created in Phases 2–6
- **False-green risk mitigated** — Phase 5.1 backend test spec includes the divergent-date guardrail that prevents passing the test against the buggy code

---

## Recommendation
Proceed with Phase 1 execution in order:
1. **1.1** Extend mock-client with all 5 methods + serviceCategories.list per §3.8 shapes
2. **1.2** Create directory `apps/web/src/__tests__/pages/commissions/`
3. **1.3** Run `cd apps/web && bun test src/__tests__/components/commissions/` to verify no regressions

All plan descriptions are ready for execution; no plan adjustments required.
