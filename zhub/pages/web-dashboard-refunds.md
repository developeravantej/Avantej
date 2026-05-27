# Refunds

**Route:** `/dashboard/refunds/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/refunds/view.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(`refund_management:read`)
**Last updated:** 2026-05-27

> Companion doc: [`web-dashboard-refunds-view.md`](./web-dashboard-refunds-view.md) — deeper details on the ledger page (KPI strip, target cell, audit drawer). This file is the route-group index; both docs describe the same single route.

---

## 1. What It Does

**Purpose (user perspective):** Review, approve, reject, and process refund requests from customers. Single landing page for the full refund lifecycle.

**Produces:** Status-tabbed refund ledger (all / pending / approved / rejected / processed) with KPI strip; per-row contextual actions (Approve, Reject, Mark Processed, View Details); detail drawer with audit trail; rejection-notes and process-method dialogs.

**On success:**
- Refund approved (pending → approved) — toast, list invalidated.
- Refund rejected (pending → rejected) — `reviewNotes` required.
- Refund marked processed (approved → processed) via `ProcessRefundDialog` (method + optional reference).
- Detail drawer renders refund info, review block, processing block, and audit trail.

**On failure / error states:**
- `<PageLoader />` while loading.
- `EmptyState` ("No refunds found") when zero rows match the filter.
- `StatusCallout variant="error"` with `onRetry` on fetch failure.
- Permission guard: "You do not have permission to view refunds."

---

## 2. How It Works

**Execution flow:**
```
RefundsLedgerPage
  → useUserContext() → organizationId, hasPermission (canApprove, canProcess)
  → activeTab → useQuery(["refunds", orgId, activeTab])
      → client.refunds.list({ status?, limit: 100, offset: 0 })
  → KPI computed in memory from rows (pendingCount, approvedTodayCount, totalRefundedCents)

Row actions:
- pending  + canApprove → Approve → approveMutation (useApiMutation, invalidate refundsKey)
                       → Reject  → RejectDialog → rejectMutation
- approved + canProcess → Mark Processed → ProcessRefundDialog → client.refunds.process
- processed/rejected   → View Details → RefundDetailDrawer
                         → useQuery(["audit-refund", orgId, refundId])
                             → client.auditLogs.list({ entityType: "refund", entityId })
```

**Inputs:** activeTab; row clicks; rejection notes; refund method + reference.

**State management:**
- TanStack Query: refunds list + audit trail.
- Local `useState`: `activeTab`, drawer/dialog open flags, in-flight IDs (`approveRefundId`, `processRefundId`, `rejectRefundId`).
- Approve/reject use `useApiMutation` (`invalidate: [refundsKey]`).
- `ProcessRefundDialog` invalidates `["refunds", orgId]` directly on success.

**Outputs:** Table with status badges; conditional action buttons; drawer + dialogs.

**Side effects:** Approves, rejects, processes refunds; invalidates list cache; toast feedback.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.refunds.list`
- `client.refunds.approve` (optional reviewNotes)
- `client.refunds.reject` (reviewNotes required)
- `client.refunds.process` (refundMethod, optional refundReference) — via `ProcessRefundDialog`
- `client.auditLogs.list` — drawer-scoped, lazy

**Uses these components:**
- `DataTable` — `@/components/tables/sales/view/data-table`
- `StatusBadge` (wrapped as `RefundStatusBadge`)
- `CopyableCell` — refund number
- `ProcessRefundDialog` — `@/components/refunds/process-refund-dialog`
- Inline `RefundDetailDrawer`, inline `RejectDialog`, inline `TargetCell`
- `EmptyState`, `StatusCallout`, `PageLoader`, `Dialog`, `Textarea`, `Separator`, `Button`, `Label`

**Uses these hooks:**
- `useUserContext()` (org + `hasPermission`)
- `useQuery`, `useApiMutation`, `useState`

**Navigation: who navigates here:** Sidebar (Sales & Finance → Refunds); direct URL.

**Navigation: where it goes:** `TargetCell` → `/dashboard/sales/$id` for sales-order targets. Payment/package targets render as plain text.

---

## 4. Data Shapes

**DB tables:** `refunds` (read/update via procedures), `audit_logs` (read).

**Key types:**
```typescript
type RefundStatus = "pending" | "approved" | "rejected" | "processed" | "cancelled";

// list response
{ rows: RefundRow[]; total: number }

// approve input  → { organizationId, id, reviewNotes? }
// reject input   → { organizationId, id, reviewNotes }  // required
// process input  → { organizationId, id, refundMethod, refundReference? }
//                  refundMethod ∈ "cash" | "card_reversal" | "bank_transfer" | "store_credit"
```

See `web-dashboard-refunds-view.md` §4 for the full `RefundRow` shape and refundable-cap formulas.

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Tab filtering query-key change.
- Approve/reject/process mutations + cache invalidation.
- Audit trail lazy loading (only when drawer open).
- Permission guards (`:read`, `:approve`, `:process`).
- `TargetCell` resolution priority (sale > payment > package).
- KPI math edge cases (timezone in "Approved today").

---

## 6. Notes

- **Single route, two docs:** This file and `web-dashboard-refunds-view.md` describe the same route. Treat `-view.md` as the primary deep-dive.
- **Status mapping:** `processed → completed` canonical (label "Processed"); others map directly.
- **`installments.processRefund` is deprecated** — UI rewired to open `RequestRefundDialog` everywhere.
- **`ProcessRefundDialog`** requires reference for non-cash methods (free-form input); enforces no Zod constraint on reference (UI hint only).
- **Currency**: amounts stored in cents (`amountCents`, `taxAmountCents`); formatted via `formatPrice` from `@/lib/money`.
- **Concurrency**: backend `processRefund` uses `SELECT FOR UPDATE` on target rows to prevent races with concurrent writes.
- **`auditQuery` shape**: `(data as { rows?: AuditRow[] } | undefined)?.rows ?? []` — narrowed at the call site because the audit endpoint isn't strictly typed.

### 2026-05-27 audit-prove commission delta

- **F-07** `approveRefund` now `SELECT … FOR UPDATE`s the parent target (sales_order / payment / package_instance) so the remaining-refundable cap check serializes against concurrent approvals — prevents double-approve where two concurrent calls each individually pass the cap but exceed it together.
- **F-06** Refund approval is now the upstream caller for the commission-split reversal + status-flip flow (fully-reversed splits become `void`; liability deducts reversals). Commission-side detail in `web-dashboard-commissions-view.md`.
- Source: `packages/services/src/refunds.service.ts`, `packages/services/src/commission-splits.service.ts`.
