# Scalability Audit
**Session:** 04-22_20-59_design-guidelines-rollout
**Findings:** 5 (0 critical · 1 high · 2 medium · 1 low · 1 info)

## Findings

### [HIGH] Bulk void runs N sequential transactions with no size cap

**Plan claims:** `commissions.bulkApprove` is a future backend task; bulk-approve atomicity is deferred.
**Actual:** The bulk-void path already exists in production code. `bulk-action-bar.tsx` (lines 183–201) issues one `client.commissionSplits.void` call per selected ID in a sequential `for` loop — each call opens its own transaction (`voidCommissionSplit` wraps a `SELECT ... FOR UPDATE` + `UPDATE` + audit in `tenantDb.transaction`). There is no batch size cap on the frontend, so a user who selects 200+ rows fires 200+ round-trips and 200+ separate transactions. This is the live void path, not a future one.
**File:** `apps/web/src/components/commissions/bulk-action-bar.tsx:184`
**Service:** `packages/services/src/commission-splits.service.ts:417`
**Fix:** Add a backend `voidCommissionSplits(ids[], reason)` bulk endpoint that does one `SELECT ... FOR UPDATE` + one `UPDATE ... WHERE id IN (...)` + per-row audit rows inside a single transaction; cap input at 200 IDs server-side.

---

### [MEDIUM] Anti-duplicate pre-flight read for drop-ins is outside the transaction — TOCTOU race window exists

**Plan claims:** Phase 5.2 Option A is a "pre-flight query for latest check-in timestamp (pre-flight before create)." The plan asks whether `checkIns.create` is currently wrapped in a transaction.
**Actual:** `recordCheckIn` (lines 275–305) performs the 30-minute window check **before** calling `tenantDb.transaction(...)` (line 308). The anti-duplicate read is not inside the transaction. Two concurrent drop-in check-ins for the same client can both pass the pre-flight read before either insert commits, resulting in duplicate rows. The duplicate-key constraint on `checkIns` (if any) is the only safety net; none was confirmed in the schema files read.
**File:** `packages/services/src/check-ins.service.ts:275` (pre-flight read), `308` (transaction start)
**Fix:** Move the anti-duplicate query inside the transaction and precede it with `SELECT ... FOR UPDATE` on the `clientId + branchId + outcome` composite, or add a partial unique index on `(clientId, branchId, outcome)` filtered to `appointmentClientId IS NULL` for the drop-in case.

---

### [MEDIUM] `bulkApprove` already exists and uses `SELECT ... FOR UPDATE` on an unbounded `IN` list

**Plan claims:** "`commissions.bulkApprove` is a pending backend addition."
**Actual:** `approveCommissionSplits` already exists in `commission-splits.service.ts` (line 291) and the `approve` procedure is already wired in the router (`packages/api/src/routers/commission-splits.ts:217`). It wraps a `SELECT ... FOR UPDATE ... WHERE id IN (ids)` followed by a bulk `UPDATE ... WHERE id IN (ids)`. The lock is correct and all writes are atomic. However, the `ids` array is unbounded — there is no server-side cap on how many rows are locked and updated in one transaction, which can lead to long-held locks and connection pool exhaustion under load.
**File:** `packages/services/src/commission-splits.service.ts:298–339`
**Fix:** Add a server-side cap (e.g. 500 IDs per call) with a clear `BAD_REQUEST` response; document the limit in the procedure's input schema.

---

### [LOW] Payouts hard-50 default is a pre-existing limitation, confirmed as-is

**Plan claims:** "payouts/view.tsx has a hard 50-row limit and no pagination (§17) — flag but keep out of this plan."
**Actual:** Confirmed pre-existing. `payouts/view.tsx` calls `client.payouts.list({ organizationId, status })` with no `limit` argument (line 43–47). The router schema defaults `limit` to `50` (max 200) and the frontend provides no pagination controls or override. This is not introduced by the current plan — it predates the branch.
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.tsx:43`, `packages/api/src/routers/payouts.ts:30`
**Fix:** (Out of scope for this plan per §17.) Add cursor/offset pagination to `payoutsRouter.list` and a load-more or page control to the view.

---

### [INFO] Bundle size estimate is plausible; N/A claims for UI-only refactor verified

**Plan claims:** "4 new primitives, each ~1–3 KB gzipped. No new query logic touched."
**Actual:** Both files audited contain zero direct DB imports or query logic. `bulk-action-bar.tsx` calls `client.commissionSplits.approve` and `client.commissionSplits.void` via oRPC client only. `today-bookings.tsx` calls `client.checkIns.recordCheckIn` and `client.checkIns.recordBulkCheckIn` via oRPC client only. For bundle size: existing UI primitives range from ~1.2 KB (checkbox) to ~2.5 KB (table) raw source. Gzipped, 4 small primitives at 1–3 KB each is consistent with observed component sizes. Estimate is plausible.
**File:** `apps/web/src/components/commissions/bulk-action-bar.tsx`, `apps/web/src/components/attendance/today-bookings.tsx`
**Fix:** No action required.

---

## Summary

The plan's N/A claims for query-layer impact are correct for the UI refactor itself — neither audited component contains direct DB logic. However, two medium-severity scalability gaps already exist in deployed service code that the plan's execution will expose more heavily: the anti-duplicate drop-in check in `recordCheckIn` runs outside its own transaction (TOCTOU race), and the bulk-void frontend loop in `bulk-action-bar.tsx` fires N separate transactions with no cap. A third finding updates a plan assumption: `bulkApprove` is not a pending addition but is already live, and carries an unbounded lock-scope risk. The payouts 50-row hard limit is confirmed as a pre-existing issue, not introduced by this plan.
