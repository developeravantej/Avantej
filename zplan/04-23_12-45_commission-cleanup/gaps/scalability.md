# Scalability Audit (Re-audit Pass)
**Session:** zplan/04-23_12-45_commission-cleanup  
**Audit Date:** 2026-04-23  
**Findings:** 1 (0 critical · 1 high · 0 medium · 0 low · 8 info)

---

## Findings

### [HIGH] Bulk void is sequential `for...await` loop — Phase 3.2 pending execution

**Plan claims:** Phase 3.2 (§3.7, lines 189–208 of `bulk-action-bar.tsx`) replaces the sequential `for...await` loop with `Promise.allSettled` to achieve N parallel HTTP calls for improved throughput.

**Actual status:** The plan's audit/applied.md (line 50, "H2 scalability") correctly identified this as "Already scheduled for Phase 3.2" — confirmed in execution check on 2026-04-23:
- File: `apps/web/src/components/commissions/bulk-action-bar.tsx:189-208`
- Current code uses sequential loop

**Plan's intended fix (§3.7):** Replace with parallel `Promise.allSettled` that counts fulfilled vs. rejected, returning `{ fulfilled, rejected }` for branched toast logic.

**Impact if pending:** 
- For N=100 sequential voids at ~25ms per roundtrip ≈ 2.5s added latency vs. <300ms parallel.
- Plan's §7.5 conclusion ("no scalability risks") is correct **only after Phase 3.2 is applied.**
- This is the expected state — Phase 3.2 is a planned change, not a regression.

**Prerequisites met:** ✓
- `voidCommissionSplit` is idempotent (service returns existing row if already void, §3.7 + confirmed in service.ts:430-432).
- Each void call is in its own transaction (service.ts:417–452).
- Query invalidation is already correctly scoped to fire once per batch, not per void (confirmed in service.ts:202, inside `onSuccess` of the outer mutation).

**Acceptance criterion for Phase 3.2:**
- Both test cases pass (success + partial-failure toasts).
- User completes Journey D and sees accurate partial-failure counts.

**Rate:** INFO (planned but not yet executed; plan correctly describes the fix and prerequisites).

---

### [INFO] `commission_splits.earnedAt` index verified present

**Plan claims:** (§7.5) Index on `earnedAt` ensures Phase 5's `WHERE earnedAt >= from` and `ORDER BY earnedAt DESC` perform well.

**Actual:** `packages/db/src/schema/tenant/commission-splits.ts:96` — `earnedAtIdx: index("commission_splits_earned_at_idx").on(table.earnedAt)` ✓

**Plan cites:** Plan §7.3 (migration plan) correctly references the actual index name as `commission_splits_earned_at_idx` (per audit/applied.md clarification).

**Fix:** No action needed.

---

### [INFO] Pagination bounded at max 200, default 100

**Plan claims:** (§7.5) `limit ≤ 200`, default 100, unchanged.

**Actual:** `packages/api/src/routers/commission-splits.ts:169` — `z.number().min(1).max(200).default(100)` ✓

**Fix:** No action needed.

---

### [INFO] `voidCommissionSplit` is idempotent — already-void rows are a silent no-op

**Plan claims:** (§3.7) Service treats already-void rows as idempotent; enables safe parallel execution.

**Actual:** `packages/services/src/commission-splits.service.ts:430-432` — returns existing row without error if `status === "void"`. Each void call is wrapped in its own transaction (lines 417–452).

**Status for Phase 3.2:** ✓ Prerequisites for parallel execution are met.

**Fix:** No action needed; confirms parallel calls are safe once Phase 3.2 lands.

---

### [INFO] Bulk approve/markPaid cap enforced at router layer (100 items)

**Plan claims:** (§7.5) N ≤ 100 bulk cap implied by existing patterns.

**Actual:** `packages/api/src/routers/commission-splits.ts:221, 274` — `approve` and `markPaid` both enforce `z.array(...).max(100)`. `void` takes a single ID (line 329); N void calls is a frontend concern, bounded only by selection size.

**Phase 3.2 implication:** Once `Promise.allSettled` is used, 100 parallel void calls stay within browser per-origin connection limits (~6 concurrent; additional requests queued but not blocked).

**Fix:** No action needed.

---

### [INFO] `liabilitySummary` uses SQL aggregation — no N+1 loops

**Plan claims:** (§7.5) No N+1 queries; aggregation is SQL-side.

**Actual:** `packages/services/src/commission-splits.service.ts:554-732` — uses `sql<number>` conditional sums with GROUP BY `staffId`. Category filter uses EXISTS subquery. No in-JS loops over rows.

**Fix:** No action needed.

---

### [INFO] `earnedAt` timestamp has microsecond precision — sort stable

**Plan claims:** No concern raised.

**Actual:** `packages/db/src/schema/tenant/commission-splits.ts:76` — `timestamp("earned_at", { withTimezone: true })`. PostgreSQL `timestamp` has microsecond precision; `ORDER BY earnedAt DESC` is deterministic for any realistic load.

**Fix:** No action needed.

---

### [INFO] Query invalidation fires once per bulk void batch

**Plan claims:** (Task 3.3) Single `queryClient.invalidateQueries` regardless of N void calls.

**Actual:** `apps/web/src/components/commissions/bulk-action-bar.tsx:202` — `queryClient.invalidateQueries({ queryKey: ["commissions"] })` is inside `onSuccess` of the single outer mutation.

**Phase 3.2 implication:** After `Promise.allSettled` is applied, the shape returns `{ fulfilled, rejected }` and `onSuccess` still fires exactly once, with query invalidation still inside it. ✓

**Fix:** No action needed. Confirmed correct even after Phase 3.2 `Promise.allSettled` change.

---

### [INFO] Phase 5 `earnedAt` filter/sort change is pending (not yet in service code)

**Plan claims:** Phase 5.2 swaps `createdAt` → `earnedAt` in `listCommissionLedger`.

**Actual:** `packages/services/src/commission-splits.service.ts:916, 920, 937` still use `createdAt`. Expected — plan not yet executed.

**Other functions already aligned:**
- `liabilitySummary` (line 585-586) already filters on `earnedAt` ✓
- `markPaidBatch` (line 778-779) already filters on `earnedAt` ✓

**Plan documentation:** Clarified per audit/applied.md: `earnedAt` is NOT NULL at schema level; no legacy rows exist. Migration `0014_lively_jane_foster.sql` introduced the index.

**Fix:** No action needed; Phase 5.2 will make the edit.

---

## Summary

**Status: HIGH finding correctly tracked — NOT a regression.**

The plan's scalability architecture is sound. All prerequisites are in place:
- `earnedAt` is indexed (`commission_splits_earned_at_idx` ✓)
- Pagination is bounded (max 200, default 100 ✓)
- Idempotency is implemented (already-void is a no-op ✓)
- Aggregations avoid N+1 loops ✓
- Query invalidation is correctly scoped ✓

The single HIGH finding is that **Phase 3.2's `Promise.allSettled` parallelization is the plan's proposed fix**, not yet implemented. The current sequential `for...await` loop is the defect being addressed by the plan, not a regression.

**No new scalability concerns** introduced by audit-apply modifications. The clarifications to schema/migration/index naming are documentation fixes only.

**Execution path:** Phase 3.2 will replace the loop with `Promise.allSettled` per the plan's design. Once that lands, the plan's §7.5 performance conclusions hold.

---

**Rating: INFO** (planned change pending execution; plan correctly describes the fix and all prerequisites).
