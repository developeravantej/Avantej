# Domain: Commission rule engine, splits, math, cycle

Audit date: 2026-05-27. Scope: category-commission router/service, commission-splits router (split into read/lifecycle/analytics/review)/service, commission-calculator service, commission-cycle service, commission-math pure helpers.

---

## Endpoints / Procedures

### `packages/api/src/routers/category-commission.ts`

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `getByCategory` | `tenantProcedure` + `category_commission_management:read` | Return commission config (slots, rates, conditions) for a category. | `getCategoryCommissionConfig` |
| `upsert` | `tenantProcedure` + `category_commission_management:create` OR `update` | Replace entire commission config for a category (paymentType, slots, rates, conditions). Validates slots sum to 10000 bp at router AND service. | `upsertCategoryCommissionConfig` |
| `delete` | `tenantProcedure` + `category_commission_management:delete` | Hard-delete the commission config row for a category (cascades via FK to slots/rates/conditions). | `deleteCategoryCommissionConfig` |

### `packages/api/src/routers/commission-splits/read.procedures.ts`

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | `tenantProcedure` + `commission_management:read` | Filtered list of raw splits (legacy). RBAC-scoped via JOINed branchId. | `listCommissionSplits` |
| `getByAppointment` | `tenantProcedure` + `commission_management:read` | All splits for one appointment. Branch-gated. | `getCommissionsByAppointment` |
| `getMyCommissions` | `tenantProcedure` + `commission_management:read` | Splits for the calling member (uses `context.member.id` — **BUG**, see Gap P1-A). | `getMyCommissions` |
| `listLedger` | `tenantProcedure` + `commission_management:read` + `guardBranchAccessible(branchId)` | Enriched ledger with totals (pending/approved/paid) for the Commissions page. | `listCommissionLedger` |

### `packages/api/src/routers/commission-splits/lifecycle.procedures.ts`

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `approve` | `commission_management:approve` | Bulk approve pending → approved (single staff, ≤31-day window). | `approveCommissionSplits` |
| `markPaid` | `commission_management:process` | Bulk approved → paid; optional `payoutId`. | `markCommissionSplitsPaid` |
| `void` | `commission_management:approve` | Void single split (rejects paid). | `voidCommissionSplit` |
| `createManualAdjustment` | `commission_payout:create` | Manual bonus/clawback. Router enforces XOR of three target IDs. | `createManualAdjustment` |
| `markPaidBatch` | `commission_payout:update` | Batch-mark approved splits paid by member set + earnedAt range. | `markPaidBatch` |
| `markPaidById` | `commission_management:process` | Mark by id list + paymentReference (re-uses `markCommissionSplitsPaid`). | `markCommissionSplitsPaid` |
| `voidById` | `commission_management:approve` | Duplicate of `void` with a clearer name. | `voidCommissionSplit` |

### `packages/api/src/routers/commission-splits/analytics.procedures.ts`

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `liabilitySummary` | `commission_management:read` OR `commission_payout:read` | Per-trainer approvedUnpaid/paid/manual totals over a range. Reversals netted via subquery. | `liabilitySummary` |
| `liabilityByStaff` | `commission_management:read` + `guardBranchAccessible` | Single GROUP BY pending/approved/paid per staff; LIMIT 500. | `liabilityByStaff` |

### `packages/api/src/routers/commission-splits/review.procedures.ts`

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `listPendingReview` | `commission_management:read` | Cursor-paginated `status='pending_review'` splits (high-value manual adjustments). | `listPendingReview` |
| `resolveReview` | `commission_review:resolve` | Promote `pending_review` → `pending` (approve) or `void` (reject). Locks row + scope-checks earner's hierarchyScopeId. | `resolvePendingReview` |

---

## Logic Functions

### `packages/services/src/commission-math.ts`
- `assertConfigSumIs10000(allSlots, configId)` — throws when slot bps ≠ 10000. Called by `_buildSplits`.
- `dedupeBySlotIndex(assignments)` — drops duplicate slot indices to prevent double-pay. Called by `_buildSplits`.
- `computeEffectiveWeightages(allSlots, validAssignments)` — redistributes absent-slot bps across present coaches; first `remainder` coaches +1 bp.
- `computeFinalAmountCents(base, weightage, qty)` — `floor((base × weightage × qty)/10000)`; floors once.

### `packages/services/src/commission-cycle.service.ts`
- `resolveCyclePolicy(db, branchId)` — single SELECT prefers branch-specific over tenant-wide row; default = calendar_month.
- `deriveCycleBounds(policy, earnedAt)` — pure `[start,end)` derivation per cycle type. Called by `resolveCycleBoundsForDate`.
- `resolveCycleBoundsForDate(db, branchId, earnedAt)` — convenience wrapper. Called by `applyCommissionCaps`.
- `DEFAULT_POLICY` — exported const.

### `packages/services/src/category-commission.service.ts`
- `getCategoryCommissionConfig(db, categoryId)` — fetch config + slots + (rates OR conditions+rates). N+1: condition rates fetched in `Promise.all` loop.
- `upsertCategoryCommissionConfig(db, input, actor)` — DELETE+INSERT in tx; validates slot sum + condition non-overlap. `actor` is `_actor` — **never written to audit log** (see Gap P2-A).
- `deleteCategoryCommissionConfig(db, categoryId)` — hard delete; throws if not found. **No audit log write** (see Gap P2-A).

### `packages/services/src/commission-calculator.service.ts`
- `calculateCommissionForAppointment(db, params)` — appointment path. Resolves config, picks condition by attendeeCount, calls `_buildSplits`. Called by `appointment.service`.
- `calculateCommissionForPos(db, params)` — POS path. Conditions ordered by `COALESCE(minQuantity,0) DESC`. Called by `pos.service` / `sales-order.service`.
- `_buildSplits(db, p)` (internal) — applies cap, inserts split directly into `commission_splits`, writes audit. Handles PG 23505 (concurrent dup) by skipping.

### `packages/services/src/commission-splits.service.ts`
- `resolveCategoryIdForSplit(db, source)` (internal) — picks first commission-eligible category for a source.
- `computeOrderDiscountBps(db, salesOrderId)` (internal) — sum `promotion_usages.discountAmount` ÷ gross order total in bps.
- `applyCommissionCaps(db, params)` — discount-exclude + per-cycle cap; resolves branch from parent appointment/salesOrder when not passed; **packageInstance path never resolves branchId** (falls back to tenant policy — see Gap P2-B).
- `listCommissionSplits` / `getCommissionsByAppointment` / `getMyCommissions` — read paths.
- `createCommissionSplit(db, params)` — single insert with onConflictDoNothing; **bypassed by hot POS/appointment path** which uses `_buildSplits` direct-insert.
- `approveCommissionSplits(db, ids, actor)` — `FOR UPDATE`; enforces single staff + ≤31-day window; per-row audit.
- `markCommissionSplitsPaid(db, ids, params)` — `FOR UPDATE`; per-row UPDATE when `paymentReference` supplied to append to notes.
- `voidCommissionSplit(db, id, reason, actor)` — refuses paid; idempotent for void.
- `voidCommissionSplitsForSalesOrder(db, salesOrderId, reason, actor)` — used by cancelled-sales flow; skips splits whose appointment is already completed/cancelled/no_show.
- `createManualAdjustment(db, params)` — XOR check, dup-guard for (staff,appointment,manual,non-void); ≥RM500 → `pending_review` else `pending`. **No cap applied** (see Gap P2-C).
- `liabilitySummary(...)` — totals with reversals netted via pre-aggregated subquery; categoryId filter via JOIN.
- `markPaidBatch(...)` — bulk approved→paid by member+earnedAt; one audit row per member.
- `liabilityByStaff(...)` — single GROUP BY; LIMIT 500.
- `listCommissionLedger(...)` — paginated rows + totals (separate SQL).
- `getLatestConfigVersionForCategory(db, categoryId)` — **ORPHAN** in this domain — only referenced by other tests/legacy callers; not invoked by `_buildSplits` (which inserts without `configVersionId`) — see Gap P1-B.
- `getOrCreatePayoutBatch(...)` — used by `payouts.service`.
- `attachPayoutsToBatch(...)` — used by `payouts.service`.
- `reverseForRefund(db, refundId, params)` — called by `refunds.service`. Pro-rates by `creditsRefunded / creditsTotal` for package instances; **does not bound full salesOrder reversal by actual refund amount** (see Gap P1-C).
- `listPendingReview(...)`, `resolvePendingReview(...)` — review-queue surface.

---

## Gaps (prioritized)

### P1-A — `getMyCommissions` filters by `member.id`, not `member.userId`  [status: partial | testable: true]
`packages/api/src/routers/commission-splits/read.procedures.ts:81` passes `context.member.id` to `getMyCommissions(tenantDb, memberId, …)`, which queries `eq(commissionSplits.staffId, memberId)` at `packages/services/src/commission-splits.service.ts:174`. Per project convention (CLAUDE.md + zmemory: "staff_assignments.staffId = members.userId NOT members.id"), `commission_splits.staffId` stores the cross-DB `userId`. Result: **every trainer sees an empty "my commissions" list**, regardless of how many splits they earned. Repro: log in as a member with at least one approved split, hit the My Commissions page, expect rows, get empty list.
Persistence: read-only — `persistence: null`.

### P1-B — `_buildSplits` never sets `configVersionId`, breaking the per-cycle cap join  [status: partial | testable: true]
`commission-calculator.service.ts:620–639` inserts directly into `commission_splits` and omits `configVersionId`. `applyCommissionCaps` at `commission-splits.service.ts:431–443` enforces the per-cycle cap with an `innerJoin(categoryCommissionConfigVersions, eq(commissionSplits.configVersionId, ...))` filtered by `categoryId`. Because every freshly-built split is inserted with `configVersionId = null`, **the inner join drops it from the cap sum**. Net effect: per-category cycle caps are silently under-counted for every automatic split — a trainer can run past the configured cap because their newly-created splits never appear in the running total. (The comment at L417-422 explicitly says "Splits without a configVersionId (legacy manual rows) are excluded from the sum, which is the safe conservative choice" — but this excludes the *automatic* hot-path too.) The dispatch resolver `getLatestConfigVersionForCategory` exists but is unused by `_buildSplits` — ORPHAN in this code path.
Persistence: `{ tenant: <orgId>, table: commission_splits, where: { id: <new split id> }, expect: { configVersionId: <non-null> } }`.

### P1-C — `reverseForRefund` over-reverses on partial salesOrder refunds  [status: partial | testable: true]
`commission-splits.service.ts:2044–2066`. For a candidate split with `salesOrderId` set (and no `packageInstanceId`), the reversal branch is `reversalCents = -unreversed` (full clawback) regardless of `refund.amount` vs `salesOrder.totalAmount`. The partial-ratio logic only fires for `split.packageInstanceId && partialRatios.has(...)`. Consequence: partial refund of one line item on a multi-line POS sale fully zeroes out **all** commission for the entire order, even on lines that were not refunded.
Repro: create salesOrder with 2 services × 2 trainers (4 splits); refund only one item; observe all 4 splits reversed to 0 in `commission_split_reversals`.
Persistence: `{ tenant: <orgId>, table: commission_split_reversals, where: { refundId: <id> }, expect: { amountCents: <pro-rated, not full split amount> } }`.

### P1-D — Race on duplicate `markPaidById`/`voidById` procedures (router dead-end overlap)  [status: implemented | testable: false]
`lifecycle.procedures.ts` exposes both `markPaid` (≤100) and `markPaidById` (≤50 + paymentReference), plus both `void` and `voidById`. The pairs delegate to the same service fn but with different input-shape constraints. Not strictly broken — it is a UI/API surface footgun and a permission split mismatch waiting to happen. Mark as P3 cleanup unless the frontend genuinely uses both.

### P2-A — `category-commission` upsert/delete writes no audit log  [status: partial | testable: true]
`category-commission.service.ts:117` accepts `_actor` (underscore = intentionally unused) and the function returns without any `writeAudit` call. `deleteCategoryCommissionConfig` (L223) also writes nothing. Commission config changes silently rewrite the rate table for every future split — there is no audit trail of who changed bps. Repro: upsert a commission config, query `audit_log` for the org, expect a `commission_config.update` row, find nothing.
Persistence: `{ tenant: <orgId>, table: audit_log, where: { entityType: 'category_commission_config', entityId: <configId> }, expect: { action: 'update' | 'delete' } }`.

### P2-B — `applyCommissionCaps` ignores branch for `packageInstanceId`-only splits  [status: partial | testable: false]
`commission-splits.service.ts:411-413`: comment states `packageInstances doesn't carry a branchId column directly — fall back to tenant-wide policy when only packageInstanceId is set`. If a tenant has a branch-specific cycle policy and a per-cycle cap, package-credit redemptions evaluate against the **wrong cycle window** for any branch that has overridden the policy. This is silent — there is no warning logged.

### P2-C — `createManualAdjustment` bypasses cap and discount-exclude  [status: partial | testable: true]
`commission-splits.service.ts:1334-1410`. Manual adjustments above `MANUAL_REVIEW_THRESHOLD_CENTS` (RM 500) enter `pending_review`, but `applyCommissionCaps` is never called. An admin can manually credit RM 10,000 of bonus that exceeds the per-cycle cap for the trainer's category. Pure clawbacks (negative `amountCents`) are likewise unbounded. Status: likely intentional (manual is meant to override the engine), but it is undocumented — confirm with PM and decide.
Persistence: write-path; testable by creating a manual adjustment above the resolved per-cycle cap and verifying the resulting split's `calculatedAmount` matches the input (no cap applied).

### P2-D — `voidCommissionSplit` clobbers existing notes  [status: partial | testable: true]
`commission-splits.service.ts:876-880` sets `notes: reason` (overwrite, not append). Any cap-reason / payment-reference history previously stored in `notes` is lost on void. The split-paid path (L797-806) uses `notes ? "${notes} | ${ref}" : ref` — inconsistent with void.
Persistence: `{ table: commission_splits, where: { id }, expect: { notes: <preserved + appended void reason> } }`.

### P2-E — `categoryCommission.upsert` is DELETE+INSERT, breaking historical FKs  [status: partial | testable: true]
`category-commission.service.ts:153-220` deletes the entire `categoryCommissionConfigs` row and re-inserts. Any past commission_split that referenced the deleted config (via `configVersionId` once P1-B is fixed, or via downstream history queries) will dangle. Should be an UPDATE + child-row reconciliation, or rely on `categoryCommissionConfigVersions` snapshotting (but that trigger is not visible in this audit scope and `_buildSplits` does not use it — see P1-B).

### P3-A — `getCategoryCommissionConfig` is N+1 on conditional configs  [status: implemented | testable: false]
`category-commission.service.ts:54-62` fetches `commissionConditionRates` once per condition inside `Promise.all`. Replace with single `inArray` query.

### P3-B — `liabilitySummary.toDate` uses `lte(earnedAt, toDate)` — period-end double-count risk  [status: implemented | testable: false]
`commission-splits.service.ts:1065`. Inclusive upper bound means a split earned at exactly `to` is counted in both the period ending at `to` and the period starting at `to`. The cap-window code uses `< end` (correct). Minor; flag as consistency cleanup.

### P3-C — `liabilityByStaff` branch JOIN drops manual splits  [status: partial | testable: true]
`commission-splits.service.ts:1488-1515`. When `accessibleNodeIds.length > 0`, the OR filter requires `appointments.branchId IN scope OR salesOrders.branchId IN scope`. Manual splits with both `appointmentId=null` AND `salesOrderId=null` (the legitimate pure-bonus case) are dropped from the result entirely for non-admin users. Compare to `listPendingReview:2143-2155` which explicitly carves out an "appointmentId IS NULL AND salesOrderId IS NULL" case — `liabilityByStaff` does not. Pure-bonus manuals will not appear in branch-scoped staff liability totals.

### P3-D — `_buildSplits` cap-eval branch resolution mirrors P2-B  [status: partial | testable: false]
`commission-calculator.service.ts:601-608` calls `applyCommissionCaps` with no `branchId`, so the policy resolver re-fetches the parent each loop (one extra SELECT per assignment). Pre-resolve `branchId` once outside the loop.

---

## Status summary

- **testable: true** findings: **8** (P1-A, P1-B, P1-C, P2-A, P2-C, P2-D, P2-E, P3-C)
- Biggest risks: P1-B (silent cap bypass), P1-A (My Commissions empty for every trainer), P1-C (refund nukes unrelated splits), P2-A (no audit on rate-config changes).
- Cycle policy resolution (recent commit 1bdfe02e) is sound for appointment/salesOrder paths; package-instance path has a documented gap (P2-B).
