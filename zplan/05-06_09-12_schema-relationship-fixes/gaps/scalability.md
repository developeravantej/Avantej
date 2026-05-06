# Scalability Audit — Post-Apply Re-Run
**Session:** zplan/05-06_09-12_schema-relationship-fixes
**Run:** 2nd pass (after --apply amendments)
**Findings:** 7 (H 3 · M 3 · L 1)

---

## Findings

### [HIGH] Pagination pattern mismatch — new list procs will copy offset/limit
**Plan claims:** "All new list procs use cursor pagination `(occurred_at|created_at DESC, id DESC)`, limit default 50."
**Actual:** Existing `listSalesOrders()` uses offset/limit (not cursor). `packages/api/src/routers/sales-orders.ts:28-29` shows `skip` + `take` offset pagination. New agents copying existing codebase patterns will produce offset pagination.
**File:** `packages/api/src/routers/sales-orders.ts:28-29`
**Impact:** `stock_movements`, `status_history`, `commission_split_reversals` will ship with offset pagination. At 10k+ rows, O(N) scans on every page flip.
**Fix:** Plan §5 must specify per-agent: cursor keyset using `(created_at DESC, id DESC)` with input `{ after?: { createdAt: Date, id: string } }`. Agent briefs cannot say "follow existing pattern" — they must explicitly mandate cursor pagination. OR: document "offset/limit acceptable for this project scale" and remove cursor pagination claim from plan.

---

### [HIGH] LRU cache utility does not exist — tax/pricing will hit DB on every POS sale
**Plan claims:** "Tax resolver + price resolver hit on every POS sale → cached in service layer w/ tenant-scoped LRU (60s)."
**Actual:** No `cache.utility.ts` or equivalent in `packages/services/src/`. No in-memory TTL cache exists.
**File:** `packages/services/src/` — no `*cache*` utility file
**Impact:** At 100+ QPS, `tax.service.ts` and `pricing.service.ts` hit DB on every sale. Neon connection pool exhaustion risk for high-traffic tenants.
**Fix:** Agents 2.2/2.3 must create `packages/services/src/cache.utility.ts` with `LRUCache<K, V>(ttl: number, maxSize: number)` **before** shipping tax/pricing services. Cache bust on `services.update` / `service_prices` write.

---

### [HIGH] Auto-resume membership cron frequency unspecified — potential missed wakeups
**Plan claims:** Phase 3.1 creates `apps/server/src/cron/auto-resume-holds.ts` to auto-resume frozen memberships
**Actual:** Plan does not specify cron frequency (hourly? daily? on-demand?). Fitness franchises typically expect same-day auto-resume when hold expiry passes. A daily cron at midnight could delay resume by up to 23h 59m after hold end date. Plan also does not specify what happens if the cron job fails (no retry semantics).
**File:** Plan §5 Agent 3.1
**Impact:** Members whose holds expire during the day stay frozen until next cron tick. Customer experience degradation.
**Fix:** Agent 3.1 brief must specify: (1) cron frequency (recommend every 15 minutes during business hours OR triggered by webhook), (2) idempotency guarantee on re-run, (3) error reporting path.

---

### [MEDIUM] Stock movements RANGE partition strategy unresolved — inserts fail at month rollover
**Plan claims:** "Stock movements RANGE-partitioned by month."
**Actual:** §8 Open Question #2 explicitly unresolved. `pg_partman` not available on Neon. No fallback implementation defined.
**File:** Plan §7 (partition claim), §8.2 Q#2 (unresolved)
**Impact:** If next-month partition not pre-created, INSERT at month rollover fails. Cascades to all stock_movements appends.
**Fix:** Pick one before Agent 2.6 dispatch: (a) Drop partitioning — use regular table with partial index by `EXTRACT(YEAR_MONTH FROM occurred_at)`. Adequate for fitness franchise scale. (b) Implement partition pre-creation script at `apps/server/src/cron/create-stock-partitions.ts` that pre-creates 12 months of partitions on first run and adds next month on each monthly execution.

---

### [MEDIUM] `payout_batches.totals` ambiguity — stored vs. computed
**Plan claims:** Agent 2.5 creates `payout_batches` table with `totalAmount`, `totalCommissionAmount` columns
**Actual:** Plan does not specify whether these totals are: (a) stored and updated on each commission split add, (b) computed on INSERT/batch-close trigger, or (c) computed at query time via JOIN + SUM. Each approach has different consistency guarantees under concurrent writes.
**File:** Plan §5 Agent 2.5 schema definition
**Impact:** If (a) stored + updated: race condition when multiple commission splits insert concurrently for same batch. If (c) computed at query: joins grow expensive as batch size grows.
**Fix:** Agent 2.5 brief must specify: use (a) with `SELECT ... FOR UPDATE` on the `payout_batches` row when inserting splits, OR use (c) with a DB view / computed column per payout batch query.

---

### [MEDIUM] Agent 2.9 email/notification call possibly inside transaction boundary
**Plan claims:** Agent 2.9 handles commission reversal on refund approval — extends refund approval flow
**Actual:** Refund approval in `packages/api/src/routers/refunds.ts` (approve procedure) likely runs inside a DB transaction. Plan does not clarify whether the commission reversal notification (email/push) is sent inside or outside the transaction boundary.
**File:** Plan §5 Agent 2.9 — transaction boundary undefined
**Impact:** Email inside DB transaction → if email send fails, entire refund approval rolls back (over-coupled). If transaction commits before email, email is lost on server crash.
**Fix:** Agent 2.9 must send notifications AFTER transaction commits. Pattern: `await tx.commit(); await sendNotification(...)`. Use a job queue (or at-least-once outbox pattern) if email delivery reliability matters.

---

### [LOW] Index coverage gap on FK additions to existing tables — partial fix
**Plan claims:** §7 index checklist updated by first audit to include 5 missing FK indexes
**Actual:** Checklist was updated in §7 (fix applied). However, the individual agent owner-files sections (2.3 for `tax_rate_id`, 2.5 for `batch_id` + `config_version_id` + `package_instance_id`) do not explicitly list "add index" as a migration step. Agents may create FK columns without corresponding index creation in the same migration.
**File:** Plan §7 index checklist (updated) vs. plan §5 Agent 2.3, 2.5 migration task descriptions
**Impact:** Low — easy to catch in review. But if agents only add FK column without index, performance gap ships.
**Fix:** Each agent's migration task description must include the index creation SQL alongside the FK addition. Cross-reference §7 checklist explicitly in each agent brief.

---

## Summary

H15 (pagination), H17 (LRU cache) from first audit remain unresolved — no fixes were applied. M12 (partition) remains open question. Three new findings: cron frequency undefined for auto-resume (J4), payout_batches totals ambiguity, and notification outside-tx pattern. The scalability checklist in §7 was updated for indexes (low-risk), but the three high-impact items (cursor pagination, LRU cache, partition strategy) require explicit decisions before agent dispatch. Recommend: close Q2 (partition) and cursor vs offset decision in a 30-minute architecture review before Phase 2 agents launch.
