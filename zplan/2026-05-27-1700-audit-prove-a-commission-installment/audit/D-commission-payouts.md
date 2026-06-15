# Domain D — Commission Payouts (router + service + UI tabs)

Scope: `packages/api/src/routers/payouts.ts`, `packages/services/src/payouts.service.ts`, `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/{my,view}.tsx`, `apps/web/src/components/pages/commissions/{all,liability,mine,payouts,review}-tab.tsx`.

---

## 1. Endpoints (payouts router)

| Procedure | Auth / Perm | Purpose | Service fn |
|---|---|---|---|
| `list` | tenantProcedure + `commission_payout:read` | List payouts, enrich with recipient name from CP. Non-admin RBAC scoping by appointment/batch branch OR `recipientId === userId`. | inline query (`payouts.ts:37-169`) |
| `previewBatch` | tenantProcedure + `commission_payout:read` (+ RBAC on branchId) | Read-only preview of approved splits that would be paid. | `previewBatch` (`payouts.service.ts:180`) |
| `runBatch` | tenantProcedure + `commission_payout:process` (+ RBAC on branchId) | Lock approved splits, insert one payout per staff, flip splits to paid (or stay 'approved' if `confirmImmediately:false`). Also processes pending reversal adjustments first. | `processCommissionReversals` + `runBatch` |
| `recipientSummary` | tenantProcedure + `commission_payout:read` (+ scope check on recipient hierarchy) | Lifetime paid, avg/cycle, last payout. | `recipientSummary` |
| `processForRecipient` | tenantProcedure + `commission_payout:process` (+ RBAC on branchId) | Thin wrapper over runBatch for a single recipient. | `processForRecipient` |
| `markPaid` | tenantProcedure + `commission_payout:process` | `pending|processing → paid`. Flips linked approved splits to paid. Row-locked. | `markPayoutPaid` |
| `markFailed` | tenantProcedure + `commission_payout:process` | `pending|processing → failed`. Splits unchanged. Row-locked. | `markPayoutFailed` |
| `retry` | tenantProcedure + `commission_payout:process` | `failed → pending`. Row-locked. | `retryPayout` |
| `cancel` | tenantProcedure + `commission_payout:process` | `pending|failed → canceled`. Reverts linked splits to approved + clears payoutId. Row-locked. | `cancelPayout` |

State machine and row-lock pattern (mirroring F-07 refund row-lock) is complete and audit-logged on all transitions.

---

## 2. Logic functions (payouts.service.ts)

| Function | Caller(s) | Purpose | Orphan? |
|---|---|---|---|
| `processCommissionReversals` | `runBatch` procedure (preflight) | Sweep unlinked split reversals, create negative adjustment payouts, flip splits to `reversed`. Idempotent (filters on `payoutAdjustmentId IS NULL`). | No |
| `previewBatch` | `previewBatch` procedure | Aggregate approved splits per-staff. | No |
| `runBatch` | `runBatch` procedure, `processForRecipient` | Lock + insert + flip splits + recompute batch total. `FOR UPDATE` on splits; idempotent batch via `getOrCreatePayoutBatch`. | No |
| `recipientSummary` | `recipientSummary` procedure | Lifetime totals + per-cycle avg grouped by `batchId`. Excludes negative rows from cycle mean. | No |
| `processForRecipient` | `processForRecipient` procedure | Thin wrapper; defaults periodStart to month-1, periodEnd to now. | No |
| `lockPayoutForUpdate` | internal (markPaid/Failed/Retry/Cancel) | Row-lock helper. | No |
| `markPayoutPaid` | `markPaid` procedure | State transition + flip linked approved splits → paid. | No |
| `markPayoutFailed` | `markFailed` procedure | State transition; splits untouched. | No |
| `retryPayout` | `retry` procedure | State transition; splits untouched. | No |
| `cancelPayout` | `cancel` procedure | State transition + revert splits to approved + clear payoutId. | No |

No orphans.

---

## 3. UI — per tab

### `view.tsx` (route shell)
- Tabs gated: `mine` (always), `all`/`review` (`commission_management:read`), `liability`/`payouts` (`commission_payout:read`). Badge for review count.

### `mine-tab.tsx` (MyCommissionsPage)
- Data: `client.commissionSplits.getMyCommissions({ organizationId })` — **no recipient filter passed**; relies on backend to auto-scope to caller's `userId`. Acceptable IF the procedure does so (out of this audit's file scope).
- Mutations: none.
- Empty/loading/error: all handled via `Skeleton` + `StatusCallout`.
- **Note**: page treats results as "mine" purely by trust — no UI assert that returned rows' `staffId === current userId`. If `getMyCommissions` were misimplemented to take an arbitrary filter, this view would silently leak. (See G-2.)

### `all-tab.tsx` (AllCommissionsPage)
- Data: `client.commissionSplits.listLedger`.
- Mutations: `voidById` (per-row); selection-driven approve via `BulkActionBar` (delegates to backend bulk procedure not in this audit).
- Invalidation: `queryClient.invalidateQueries({ queryKey: ["commissions"] })` after void — broad enough.
- Empty / loading / error / permission gates all present.

### `review-tab.tsx`
- `useInfiniteQuery` against `listPendingReview`; mutation `resolveReview`. Invalidates `["commissions"]`, `["commissionSplits", "pendingReviewTotal"]`, `["commissions", "pendingReview"]`. Loose typing (`as any`). OK functionally.

### `liability-tab.tsx`
- Data: `client.commissionSplits.liabilitySummary` filtered by period + optional branch + category.
- Mutation: `client.commissionSplits.markPaidBatch({ memberIds, from, to })` via `useApiMutation`.
- **Invalidation**: invalidates `["commissionLiability"]`, `["commissions"]`, `["my-commissions"]` — but **NOT `["payouts", orgId]`**. After marking liability paid, the Payouts tab still shows stale data until staleTime expires. (G-1.)
- **Mark-paid path**: this writes against `commission_splits` but does NOT insert `payouts` rows. Liability "Paid" totals can therefore diverge from `payouts.list` "Disbursed this month" KPI — same money, different ledgers. (G-3.)
- Error UI: `<StatusCallout … onRetry={() => {}}>` — empty retry handler. (G-7, P3.)
- Permission gates: `commission_payout:read` to view, `commission_payout:update` to mark paid. Note: backend mark-paid path in this tab uses `commission_splits.markPaidBatch`, while payouts router gates on `commission_payout:process`. Two different permission names guard "mark paid" — easy to grant one and forget the other. (G-4.)

### `payouts-tab.tsx`
- Data: `usePayoutsList` (key `["payouts", orgId, "list"]`), `useLiabilitySummary` (prefetch), `useRecipientSummary`, `client.members.list` (active staff).
- Mutations: `useProcessForRecipient` (invalidates `payoutKeys.all(orgId)` + `["commissionLiability"]`), `RunBatchDrawer` (not in this audit but via `useRunBatch`).
- Permission gate: `canRunBatch = hasPermission("commission_payout:process")`.
- **NO UI for the row-level state machine**: backend exposes `markPaid` / `markFailed` / `retry` / `cancel`, but the table only renders `StatusBadge`. There is no action menu on `pending` / `processing` / `failed` rows, so out-of-band wire/cheque confirmations can never be recorded from this UI. The full state machine is unreachable from the product. (G-6, **P1**.)
- KPI computations are client-side over the (limit:100) list — large tenants miss months > 100 rows. (G-8.)
- `disbursedThisMonth` uses `Math.abs(p.amount)` which treats reversal/adjustment rows (negative) as additive disbursements rather than subtractive. Inflates the "Disbursed (This Month)" KPI when any reversal lands in the month. (G-5, **P1**.)
- `pendingForRecipient` (per-recipient panel) also uses `Math.abs(p.amount)` — pending negative-amount reversal adjustments contribute positively to the "Process Pending · RM…" button label, misleading operators. (G-9, P2.)

---

## 4. Gaps

### P1 — write-path / data-correctness

**G-1. Liability `markPaidBatch` does not invalidate payouts query key**
- `apps/web/src/components/pages/commissions/liability-tab.tsx:303-307` invalidates `["commissionLiability"]`, `["commissions"]`, `["my-commissions"]` but not `payoutKeys.list(orgId)` = `["payouts", orgId, "list"]`.
- Status: partial. Testable: **true** — Playwright: mark-paid in liability tab → switch to payouts tab within 30s → stale rows visible.
- Persistence: read-side cache only; no DB row change. (Underlying mark-paid does write commission_splits.)

**G-3. Two divergent "mark paid" pipelines: `commission_splits.markPaidBatch` vs `payouts.runBatch`**
- Liability tab marks splits paid WITHOUT creating a `payouts` row. Payouts tab creates `payouts` rows that flip splits to paid. Same `commission_splits.status='paid'` outcome, but only one path generates an audit-grade `payouts` ledger entry.
- After a Liability "Mark as Paid", `payouts.recipientSummary.lifetimePaidCents` and the Payouts tab "Disbursed" KPI stay at 0 even though money has moved per the audit log.
- File evidence: `payouts.service.ts` only mutates `payouts` via `runBatch` / `processCommissionReversals` / state-machine transitions; liability mark-paid writes `commission_splits` only (out-of-scope file).
- Status: partial. Testable: **true**. Persistence: `commission_splits.status`, `commission_splits.paidAt/paidBy`. No `payouts` insert.

**G-5. `disbursedThisMonth` KPI inflated by reversal/adjustment rows**
- `payouts-tab.tsx:543-547`: `payouts.filter(p.status==='paid' && paidAt>=monthStart).reduce((s,p) => s + Math.abs(p.amount), 0)`. Reversal adjustments are stored with `amount<0` (`payouts.service.ts:75-95`); using `Math.abs` adds them rather than subtracting.
- Status: partial. Testable: **true**. Persistence: read-only KPI.

**G-6. State-machine actions have no UI surface**
- Router exposes `markPaid` / `markFailed` / `retry` / `cancel` (`payouts.ts:383-507`) but `payouts-tab.tsx` never calls them. `RunBatchDrawer` creates payouts at `status='paid'` by default (`confirmImmediately` defaults true), so the only way to ever see `pending`/`processing`/`failed` payouts in the UI is via `processCommissionReversals` (which creates adjustment rows at `pending` and leaves them there indefinitely) or by passing `confirmImmediately:false` — which no client does (`features/payouts/api.ts:190-210` doesn't forward the flag).
- Reversal adjustment rows therefore accumulate in the `pending` state with **no way for an operator to settle, fail, retry, or cancel them from the product**.
- Status: missing (UI). Testable: **true** — issue a refund → reversal adjustment payout enters `pending` → no action button exists.
- Persistence: blocks lifecycle transitions on `payouts` rows.

### P2 — RBAC / scoping

**G-2. `mine-tab` does not assert returned rows belong to the caller**
- `mine-tab.tsx:107-114` calls `getMyCommissions({ organizationId })` and renders. Recipient-scoping is delegated entirely to backend (`commission-splits/read.procedures.ts`). The Mine tab does not filter or assert `row.staffId === userContext.user.id`. If the underlying procedure is later changed to accept a `staffId` override (e.g. for admin "view as"), this UI would not detect a leak.
- Status: partial. Testable: false (defensive coding — would require backend-injection test).

**G-4. Two different perms gate the same action ("mark commission paid")**
- Liability tab: `commission_payout:update` (`liability-tab.tsx:187`).
- Payouts router state machine: `commission_payout:process` (`payouts.ts:393, 427, 458, 490`).
- Granting `update` without `process` lets a user mark splits paid via Liability but not via Payouts state machine. Inconsistent permission surface.
- Status: implemented but inconsistent. Testable: true (functional, with two RBAC users).

**G-9. Pending-for-recipient ledger label uses `Math.abs` over negative reversals**
- `payouts-tab.tsx:212-214`: `recipientPayouts.filter(p.status==='pending').reduce((s,p)=>s+Math.abs(p.amount),0)`. Pending reversal adjustments (negative amount, pending status — current state per G-6) show as positive RM owed, misleading operators about what "Process Pending" will pay out. Once `processForRecipient` runs, the adjustment is NOT picked up (it filters approved splits, not pending payouts).
- Status: partial. Testable: true.

### P3 — UX / hygiene

**G-7. Liability tab error retry handler is empty**
- `liability-tab.tsx:410`: `<StatusCallout variant="error" onRetry={() => {}}>` — clicking Retry does nothing. Should call `refetch()` (already pulled from `useQuery` but discarded — destructure omits `refetch`).
- Status: partial. Testable: true.

**G-8. Payouts KPIs computed client-side over `limit:100`**
- `features/payouts/api.ts:115-119` hard-codes `limit:100`. `payouts-tab.tsx` derives "Disbursed this month", "Avg payout", "Last batch" from the truncated array. A tenant with > 100 payouts per month sees wrong KPIs.
- Status: partial. Testable: true (requires seeding > 100 payouts).

**G-10. `runBatch` mutation does not forward `confirmImmediately` flag**
- Router accepts `confirmImmediately` (`payouts.ts:229`) and service honours it, but `useRunBatch` / `RunBatchDrawer` (`features/payouts/api.ts:190-210`) never sends it. Bank-transfer / cheque batches are therefore always confirmed immediately, defeating the entire `pending → paid` state-machine design for the most common non-cash flow.
- Status: partial. Testable: true.

**G-11. Loose `any` types in review tab**
- `review-tab.tsx:192-205,225` casts `pageParam`, `lastPage`, `client.commissionSplits.resolveReview(... as any)`. Hides typing regressions. P3.

**G-12. Bulk approve concurrency**
- `BulkActionBar` (out of scope) and `runBatch` itself are the only bulk-write paths. `runBatch` already uses `SELECT … FOR UPDATE` on splits + idempotent batch resolution + PG 23505 trap (`payouts.service.ts:355-518`) — concurrent runs are safe. No gap here; called out for completeness re the audit prompt.

**G-13. Hard-coded currency `"myr"`**
- `payouts.service.ts:90, 414`: `currency: "myr"` is literal. If the tenant currency ever drifts from MYR (multi-region), payout rows persist the wrong unit. UI also formats unconditionally with `formatPrice(x, "MYR")` across all tabs. Status: partial. Testable: false in current single-currency deployment.

---

## 5. Persistence map (write-path findings)

| Finding | Tables touched | Audit row written? |
|---|---|---|
| G-3 Liability mark-paid | `commission_splits` (status/paidAt/paidBy) — NO `payouts` insert | unknown (out-of-scope file) |
| G-6 (state machine unreachable) | `payouts` (would write status,paidAt,notes,manualPayout*), `commission_splits` (status, payoutId) on markPaid/cancel | `audit_log` rows ARE written by service when invoked (`payouts.service.ts:738,792,841,905`); just never invoked |
| G-10 (`confirmImmediately` not forwarded) | `payouts.status` initial value, `commission_splits.status` flip | `payout.create` + per-split `commission.mark_paid` audit rows still written |

---

## 6. Summary

- Biggest gap: **G-6** — the payout state machine (markPaid/markFailed/retry/cancel) is fully implemented server-side with row locks and audit, but has zero UI affordances. Reversal-adjustment payouts therefore accumulate as un-actionable `pending` rows forever.
- **G-3** — Liability's "Mark as Paid" writes to `commission_splits` only, while Payouts' `runBatch` writes to both `payouts` and `commission_splits`. Two divergent ledgers for the same operator intent — the Payouts tab's "Disbursed" KPI and `recipientSummary` will under-report any liability-tab settlements.
- **G-10** — `confirmImmediately:false` plumbing exists end-to-end in the service + router, but the `useRunBatch` mutation never sends the flag, so bank-transfer / cheque batches always land at `paid` immediately, defeating the whole state machine.
- **G-1** — Liability mark-paid does not invalidate the payouts query key, so the Payouts tab shows stale rows for up to 30s after a settlement.
- **G-5 / G-9** — `Math.abs(amount)` on reversal rows (negative) inflates the "Disbursed this Month" KPI and the per-recipient "Process Pending" label, misleading operators after refunds.

Testable: true findings = **9** (G-1, G-3, G-4, G-5, G-6, G-7, G-8, G-9, G-10).
