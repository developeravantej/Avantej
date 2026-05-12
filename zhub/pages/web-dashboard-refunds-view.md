# Refunds Ledger

**Route:** `/dashboard/refunds/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/refunds/view.tsx:1`
**Platform:** web
**Auth required:** authenticated + `refund_management:read`
**Last updated:** 2026-04-19

---

## 1. What It Does

**Purpose:** Unified refund workflow ledger. Manager approves/rejects pending requests; ops processes approved ones and enters the refund method/reference.

**Produces:** Tabbed table (All / Pending / Approved / Rejected / Processed). Columns: Date, Refund #, Customer, Target, Amount, Reason, Requested By, Status, Actions.

**On success:** Actions mutate status; audit rows land for each transition. Detail drawer shows full info + audit trail.

---

## 2. How It Works

**Execution flow:**
```
Tab change / filter → useQuery(["refunds", status, filters])
  → client.refunds.list({ organizationId, status, ... })
    → refundsRouter.list              # rbac: refund_management:read
      → listRefunds()                 # service
        → refunds (tenant, migration 0023)
        → cross-DB actor/customer name enrichment

Action buttons (conditional by status):
- Pending: Approve → refunds.approve, Reject → refunds.reject (notes required)
- Approved: Mark Processed → ProcessRefundDialog (method + reference)
- Processed/Rejected: View Details → drawer
```

**processRefund tx (the critical one):**
```
1. SELECT refund FOR UPDATE; require status='approved'
2. UPDATE refund: status='processed', processedBy/At, refundMethod, refundReference
3. If salesOrderId: SELECT FOR UPDATE sales_order; cancelledAmount += amount; status='cancelled' if cumulative >= totalAmount
4. If paymentId: SELECT FOR UPDATE payment; refundAmount += amount; status='refunded' if cumulative >= totalAmount
5. If packageInstanceId: paymentStatus='refunded' when fully refunded
6. writeAudit('sale.refund.process')
```

---

## 3. What Depends On It

**API endpoints:**
- `refunds.list`, `refunds.getById`
- `refunds.request` — at least one target (salesOrderId | paymentId | packageInstanceId)
- `refunds.approve`, `refunds.reject`
- `refunds.process` — the atomic 4-table update

**Components:**
- `RequestRefundDialog` — called from `sales/$id` (Request Refund button) AND `packages/installments/view` (old refund flow rewired)
- `ProcessRefundDialog` — method + reference modal

**Navigation: incoming:** Sidebar under Sales & Finance > Refunds.

---

## 4. Data Shapes

**Key table:** `refunds` (migration 0023)
- 3 nullable target FKs: `salesOrderId`, `paymentId`, `packageInstanceId` — at least ONE required (CHECK constraint)
- Lifecycle fields: `status`, `requestedBy/At`, `reviewedBy/At`, `reviewNotes`, `processedBy/At`, `refundMethod`, `refundReference`
- RBAC: `branchId` filter
- `refundNumber`: `RF-YYYYMMDD-NNNN`

**Refundable cap (per target):**
- salesOrder: `totalAmount - cancelledAmount - sum(approved/processed refunds)`
- payment: `totalAmount - refundAmount - sum(approved/processed refunds)`
- packageInstance: `totalPrice - sum(installment_events manual_refund) - sum(approved/processed refunds)`

---

## 5. Tests

None yet. Chrome-verified: page renders with 5 tabs + column headers + "No results." empty state.

---

## 6. Notes

- `installments.processRefund` (old endpoint) is **deprecated** but kept for backward compat. UI rewired to open `RequestRefundDialog`.
- `SELECT FOR UPDATE` on target rows inside the processRefund tx prevents races with concurrent writes.
- Legacy cancelled sales (with `cancelledAmount > 0` and no refund rows) NOT migrated — display as "Already refunded (legacy): RM X" in detail drawer.
- Shipped in tracking-pages plan phase 5 (2026-04-19).
