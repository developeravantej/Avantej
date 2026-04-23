# Doc Consistency Audit
**Session:** zplan/04-23_12-38_installment-enhancements
**Findings:** 5 (0 critical · 1 high · 3 medium · 1 low)

## Findings

### [HIGH] Integration test file path targets a non-existent file as if it exists
**Plan claims:** Phase 4 Task 4.6 says "add to" `apps/server/src/tests/integration/installments.integration.test.ts`.
**Actual:** Only `installment-plans.integration.test.ts` exists in that directory. The target file must be created from scratch, not amended.
**File:** `apps/server/src/tests/integration/`
**Fix:** Change Task 4.6 wording from "add to" to "create" and remove any implication that the file pre-exists.

---

### [MEDIUM] appointment.service.test.ts flagged as "possibly new" but task language is ambiguous
**Plan claims:** Task 4.5 says "if absent, add the file" — implies creation is conditional.
**Actual:** File does not exist. Task should read "create" unconditionally.
**File:** `apps/server/src/tests/unit/services/`
**Fix:** Update Task 4.5 to "Create `appointment.service.test.ts` with the following cases:".

---

### [MEDIUM] Web test directory for packages does not exist
**Plan claims:** Task 1.6 and 5.5 write to `apps/web/src/__tests__/pages/packages/installments-page.test.tsx`.
**Actual:** `apps/web/src/__tests__/pages/packages/` directory does not exist (only `pages/trainer-tiers.test.tsx` sibling).
**File:** `apps/web/src/__tests__/pages/`
**Fix:** Tasks 1.6 and 5.5 must create the directory. Note this explicitly in the task steps.

---

### [MEDIUM] Appointment service line number citations slightly off
**Plan claims:** "lines 264-274 — lock check block", "line 242 — start of credit-gated block".
**Actual:** Line 242 is a blank/comment line. The lock check at line 264 spans only 3 lines (264-266), not 264-274. The broader credit-gated block (242-275) is accurate.
**File:** `packages/services/src/appointment.service.ts:242–275`
**Fix:** Correct to: lock check = lines 264-266; credit-gated block = lines 242-275.

---

### [LOW] Open Question #1 simultaneously "must be resolved" and has a working default
**Plan claims:** §5 Phase 3 says "Blocked on: Open Question #1 must be resolved before Phase 3 begins". §8 says "Default assumed by this plan: (B)".
**Actual:** The plan proceeds with (B) throughout all phases. The block and the default contradict each other, leaving the executor unclear on whether to wait for a decision or proceed.
**File:** `zplan/04-23_12-38_installment-enhancements/plan/plan.md:458,732`
**Fix:** Either mark OQ#1 as "RESOLVED: (B)" if the default is confirmed, or remove the working-default language and enforce the block. Pick one.

---

## Summary

The plan is largely self-consistent and all modified-file paths exist. The one material problem is that Task 4.6 implies modifying an existing integration test file that does not exist — this would cause a confusing "file not found" error during execution. The other findings are minor wording clarifications (create vs. add, directory pre-creation, exact line ranges). Open Question #1 should be resolved to one definitive answer before Phase 3 starts to avoid ambiguity at execution time.
