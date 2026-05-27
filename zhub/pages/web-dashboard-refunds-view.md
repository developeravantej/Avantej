# Refunds Ledger

**Route:** `/dashboard/refunds/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/refunds/view.tsx`
**Platform:** web
**Auth required:** authenticated + `refund_management:read` (approve gated by `:approve`, process by `:process`)
**Last updated:** 2026-05-27

---

## 1. What It Does

**Purpose:** Unified refund workflow ledger. Manager approves/rejects pending requests; ops processes approved ones and records the refund method/reference.

**Produces:**
- Header with `Undo2` icon + "Refunds" title and tagline.
- Status tabs row (All / Pending / Approved / Rejected / Processed) rendered as in-component button row (not shadcn Tabs).
- KPI strip: Pending count, Approved today, Total refunded (approved + processed).
- DataTable: Date, Refund #, Customer, Target (Sale/Payment/Package), Amount, Reason, Requested By, Status, Actions.
- Detail drawer (`RefundDetailDrawer`) opened on row-level "View Details" with refund info, review block, processing block, and audit trail (`auditLogs.list` for entity `refund`).
- `ProcessRefundDialog` (method + reference).
- Inline `RejectDialog` (notes required, min 1 char).

**On success:** Mutations update status; query cache invalidated via `useApiMutation` `invalidate: [refundsKey]`; toast confirms ("Refund approved." / "Refund rejected.").

**On failure / error states:**
- Org-missing guard: "Select an organization to view refunds."
- Permission guard: "You do not have permission to view refunds."
- `<PageLoader />` while loading.
- `StatusCallout variant="error"` with retry on fetch failure.
- `EmptyState` (`Undo2`, "No refunds found") when zero rows and no error.

---

## 2. How It Works

**Execution flow:**
```
RefundsLedgerPage
  → useUserContext() → organizationId, hasPermission
  → activeTab state ("all" default)
  → useQuery(["refunds", organizationId, activeTab])
      → client.refunds.list({ organizationId, status?, limit: 100, offset: 0 })
  → rows: RefundRow[] = data.rows

Action buttons (per row + permission):
- pending  + canApprove → Approve  → approveMutation → client.refunds.approve
                       → Reject   → opens RejectDialog → rejectMutation → client.refunds.reject (notes required)
- approved + canProcess → Mark Processed → opens ProcessRefundDialog → client.refunds.process
- processed/rejected   → View Details → opens RefundDetailDrawer

Drawer audit trail:
  → useQuery(["audit-refund", orgId, refund.id], enabled: open && !!refund.id)
      → client.auditLogs.list({ entityType: "refund", entityId, limit: 20, offset: 0 })
```

**Inputs:** Status tab (all/pending/approved/rejected/processed); rejection notes (textarea); refund method + reference (process dialog).

**State management:**
- TanStack Query: `["refunds", orgId, activeTab]`, `["audit-refund", orgId, refundId]`.
- Local: `activeTab`, `detailDrawerOpen`, `selectedRefund`, `processDialogOpen`, `processRefundId`, `rejectDialogOpen`, `rejectRefundId`, `approveRefundId`.
- `useApiMutation` (`invalidate: [refundsKey]`) for approve/reject; `ProcessRefundDialog` invalidates separately on success.

**Outputs:** Table with status-conditional action buttons; drawer + dialogs.

**Side effects:** Approves/rejects/processes refunds. Process dialog handles its own `client.refunds.process` call and cache invalidation.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.refunds.list` — paginated, optional status filter
- `client.refunds.approve` — pending → approved (optional `reviewNotes`)
- `client.refunds.reject` — pending → rejected (`reviewNotes` required)
- `client.refunds.process` — approved → processed (`refundMethod`, optional `refundReference`)
- `client.auditLogs.list` — audit trail for refund entity (drawer-scoped)

**Uses these components:**
- `DataTable` — `@/components/tables/sales/view/data-table`
- `StatusBadge` — wrapped locally by `RefundStatusBadge`
- `CopyableCell` — refund number
- `ProcessRefundDialog` — `@/components/refunds/process-refund-dialog`
- `RequestRefundDialog` — `@/components/refunds/request-refund-dialog` (referenced by sales detail + packages flows, NOT instantiated on this page)
- Inline `RefundDetailDrawer` + `RejectDialog` (local components)
- `EmptyState`, `StatusCallout`, `PageLoader`, `Dialog`, `Textarea`, `Label`, `Separator`, `Button`

**Uses these hooks:**
- `useUserContext()`, `useQuery`, `useApiMutation` (`@/hooks/useApiMutation`), `useState`

**Navigation: who navigates here:**
- Sidebar (Sales & Finance → Refunds)
- Direct URL

**Navigation: where it goes:**
- `TargetCell` → `/dashboard/sales/$id` link when `salesOrderId` present (uses `params: { id }`)
- Payment / package targets render as text only

---

## 4. Data Shapes

**Key tables:**
- `refunds` (migration 0023) — three nullable target FKs (`salesOrderId | paymentId | packageInstanceId`), at least one required (CHECK constraint). Lifecycle: `requestedBy/At`, `reviewedBy/At`, `reviewNotes`, `processedBy/At`, `refundMethod`, `refundReference`. `refundNumber` format `RF-YYYYMMDD-NNNN`.
- `audit_logs` (read via `auditLogs.list`, `entityType = 'refund'`).

**Key types:**
```typescript
type RefundStatus = "pending" | "approved" | "rejected" | "processed" | "cancelled";

type RefundRow = {
  id: string;
  refundNumber: string;
  status: string;
  salesOrderId: string | null;
  paymentId: string | null;
  packageInstanceId: string | null;
  amountCents: number;
  taxAmountCents: number;
  reason: string;
  notes: string | null;
  requestedBy: string;
  requestedAt: string | Date;
  reviewedBy: string | null;
  reviewedAt: string | Date | null;
  reviewNotes: string | null;
  processedBy: string | null;
  processedAt: string | Date | null;
  refundMethod: string | null;     // cash | card_reversal | bank_transfer | store_credit
  refundReference: string | null;
  customerId: string;
  customerName: string;
  requestedByName?: string | null; // enriched server-side
  salesOrderNumber?: string | null;
};

const STATUS_TABS = ["all","pending","approved","rejected","processed"];
const REFUND_STATUS_MAP = {
  pending, approved, rejected, cancelled,
  processed → completed (label "Processed"),
};
```

**Refundable cap (per target, backend):**
- salesOrder: `totalAmount - cancelledAmount - sum(approved/processed refunds)`
- payment: `totalAmount - refundAmount - sum(approved/processed refunds)`
- packageInstance: `totalPrice - sum(installment_events manual_refund) - sum(approved/processed refunds)`

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Tab filter → query key change.
- Approve/reject mutation toasts and cache invalidation.
- Drawer audit trail (lazy-enabled query).
- `TargetCell` link resolution priority (sale > payment > package).
- KPI math (Approved today uses `toLocaleDateString("en-MY")` for day comparison).
- Permission guard messages.

---

## 6. Notes

- **Tabs are NOT shadcn `Tabs`** — they are custom `<button role="tab">` elements styled with bottom border. Active state via `aria-selected`.
- **`approveRefundId` UX nuance**: approve button shows "Approving…" only for the row currently approving; tracked by `approveRefundId === r.id`.
- **`auditQuery` payload**: `(data as { rows?: AuditRow[] } | undefined)?.rows ?? []` — type asserted because the audit-log response shape is not narrowly typed at the client.
- **Drawer renders inside `Dialog`** (not Sheet) — `sm:max-w-xl overflow-y-auto`.
- **`installments.processRefund` is deprecated** — UI everywhere now opens `RequestRefundDialog` instead.
- **Legacy cancelled sales** (`cancelledAmount > 0` and no refund rows) are NOT migrated; surface via the sales detail page's "Already refunded (legacy)" indicator.
- **Concurrency safety**: backend `processRefund` uses `SELECT FOR UPDATE` on sales-order / payment / package-instance rows.
- **`formatPrice` import** is `@/lib/money`.

### 2026-05-27 audit-prove commission delta

- **F-07** `approveRefund` now `SELECT … FOR UPDATE`s the parent target (sales_order / payment / package_instance) so the remaining-refundable cap check serializes against concurrent approvals. Fixes the double-approve race where two concurrent calls each individually pass the cap but exceed it in sum.
- **F-06** Refund approval now triggers commission-split status flip (fully-reversed → `void`) and reversal-aware liability — refunds flow is the caller; commission-side detail in `web-dashboard-commissions-view.md`.
- Source: `packages/services/src/refunds.service.ts`, `packages/services/src/commission-splits.service.ts`.
