# Scalability Audit (Re-run POST-APPLY)

**Session**: zplan/05-06_09-12_schema-relationship-fixes  
**Date**: 2026-05-06  
**Findings**: 8 (0 critical · 3 high · 4 medium · 1 info)

---

## Findings

### [HIGH] H15: Pagination pattern mismatch — STILL UNRESOLVED

**Plan claims**: §7 item 1 specifies cursor pagination for all new list procs using `(occurred_at|created_at) DESC, id DESC`.

**Actual**: §8 Q#3 (line 734) flags contradiction: existing codebase uses offset/limit. Plan asserts cursor keyset without decision.

**File**: plan.md:734

**Fix**: Decision required: cursor keyset OR offset/limit for all new procs. Document in agent brief.

---

### [HIGH] H17: LRU cache utility MISSING

**Plan claims**: §7 item 10 (line 732-735) requires `packages/services/src/cache.utility.ts` before Agents 2.2 (pricing) and 2.3 (tax).

**Actual**: Zero cache utility exists. `service_prices` table created by Agent 2.2; no pre-existing cache infrastructure.

**File**: plan.md:732

**Fix**: Create cache.utility.ts BEFORE Agent 2.2 starts. Agents 2.2/2.3 must wire cache bust on servicePrice/taxRate mutations.

---

### [HIGH] H16 (FK Index Gaps): §7 Checklist UNRESOLVED

**Plan claims**: §7 lines 715-720 list 5 FK indexes each agent migration must include.

**Actual**: No pre-flight verification gate in agent briefs. Missing index = full-table scans on FK joins.

**File**: plan.md:715-720, 733

**Fix**: Add post-merge validation to Agent 2.1/2.3/2.5 briefs: verify all 5 indexes present after migration apply.

---

### [MEDIUM] M12: Stock partition DECISION DEFERRED, not DECIDED

**Plan claims**: §8 Q#2 (line 746) lists options but no choice recorded.

**Actual**: Agent 2.6 owner files show `create-stock-partitions.ts (NEW if using RANGE partitions)` — conditional language.

**File**: plan.md:470, 476, 746

**Fix**: Decide NOW: plain table (lower risk) OR partitioned. Update Agent 2.6 owner files accordingly.

---

### [MEDIUM] M15: remainingCredits FOR UPDATE — scope mismatch

**Plan claims**: Agent 2.8 (line 516) specifies FOR UPDATE lock on remainingCredits decrement.

**Actual**: Column does not exist yet. Plan omits: initialization value, validation before lock, concurrent refund test case.

**File**: plan.md:502, 516

**Fix**: Agent 2.8 brief: initialize remainingCredits = quantity on insert; validate >= before FOR UPDATE; test concurrent refunds.

---

### [MEDIUM] M13 (EXCLUDE Pre-flight): Script exists, CI gate MISSING

**Plan claims**: §8 Q#5 (line 749) "RESOLVED" — Agent 2.4 creates script.

**Actual**: Plan does NOT specify WHO runs script, WHERE, or remediation path if overlaps found.

**File**: plan.md:432, 749

**Fix**: Agent 2.4 brief: exit codes, CI integration (blocking?), cleanup playbook for ops.

---

### [MEDIUM] M14: N+1 on appendStatusHistory — scalar vs array CLARIFIED

**Plan claims**: Line 494 specifies `appendStatusHistory(entityId, ...)` with singular entityId.

**Actual**: ✅ CLEAR — one entity, no bulk param. No N+1 if agent calls once per status change in same tx.

**File**: plan.md:494

**Fix**: NONE — already correct. Agent 2.7 brief should reinforce: not a loop helper.

---

### [INFO] Auto-resume cron frequency UNSPECIFIED

**Plan claims**: Agent 3.1 creates `auto-resume-holds.ts` (line 569) with cron test.

**Actual**: Plan omits schedule (daily? hourly?) and index verification for migration 0020.

**File**: plan.md:564-570, 714

**Fix**: Agent 3.1 brief: specify cron schedule + add index to migration 0020.

---

### [INFO] Commission reversal notification routing UNSPECIFIED

**Plan claims**: Agent 2.9 (line 533) queues payout adjustment on reversal.

**Actual**: No mention of coach notification on clawback. If notification sent: inside tx (risk) or outside (risk)?

**File**: plan.md:528-535

**Fix**: Agent 2.9 brief: clarify notification requirement and tx boundary (AFTER commit, not inside).

---

## Summary

**Unresolved from prior audit**: H15, H17, H16, M12  
**New risks**: M15 (validation), M13 (CI), auto-resume (frequency), reversals (notifications)  
**Clear**: M14 (status history N+1)

**Recommendation**: Update agent briefs (2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 3.1) with explicit decisions before dispatch.
