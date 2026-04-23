# Refunds

**Route:** `/dashboard/refunds/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/refunds/view.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(refund_management:read)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Review, approve, reject, and process refund requests from customers.

**Produces:** Tabbed refund ledger with columns for date, refund#, customer, target (sale/payment/package), amount, reason, requestor, status; expandable detail drawer with audit trail; process/reject dialogs.

**On success:**
- Refund approved (status: pending → approved, toast confirmation)
- Refund rejected (status: pending → rejected, with review notes)
- Refund marked processed (status: approved → processed, with method and reference)
- Detail drawer shows full history and audit trail

**On failure / error states:**
- Loading spinner during fetch
- "No refunds found" empty state (or filtered state)
- Error card with retry button
- Toast errors for failed mutations
- Permission guards: "You do not have permission to view refunds"

---

## 2. How It Works

**Execution flow:**
1. Route loads, fetches refunds via `client.refunds.list()` filtered by activeTab (all/pending/approved/rejected/processed)
2. Data mapped to `RefundRow[]` with status mapping
3. Table columns include date, refund#, customer, target (linked to sales order if applicable), amount, reason, requestor, status, actions
4. Status tabs allow filtering (pending, approved, rejected, processed, all)
5. Detail drawer:
   - Opened on row click or "View Details" button
   - Fetches audit trail via `client.auditLogs.list()` for refund entity
   - Shows refund info, review section (if reviewed), processing info (if processed), audit trail
6. Approve action:
   - Triggered by "Approve" button on pending refunds
   - `client.refunds.approve()` with optional reviewNotes
   - Invalidates refund list cache
7. Reject dialog:
   - Opens on "Reject" button (pending refunds only)
   - Requires rejection notes (text input, min 1 char)
   - `client.refunds.reject()` with reviewNotes
   - Invalidates cache
8. Process dialog (ProcessRefundDialog component):
   - Opens on "Mark Processed" button (approved refunds only)
   - User selects refund method (cash, card_reversal, bank_transfer, store_credit)
   - Optional reference field (required for non-cash)
   - `client.refunds.process()` with method and reference
   - Invalidates cache

**Inputs:**
- Tab filter (all/pending/approved/rejected/processed)
- Row click → detail drawer
- Reject notes (textarea)
- Process method (radio group) + optional reference

**State management:**
- TanStack Query: `["refunds", organizationId, activeTab]`
- Local state: activeTab, detail drawer (open + selectedRefund), process dialog (id), reject dialog (id + notes)
- Cache invalidation on approve/reject/process

**Outputs:**
- Table renders all refunds with status badges
- Buttons conditional on status and permission (refund_management:approve, :process)
- Detail drawer side panel (max-width xl)
- Toast notifications

**Side effects:**
- Approves, rejects, processes refunds
- Invalidates refund list cache
- Toast feedback
- No navigation

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.refunds.list()` — fetch refunds, optionally filtered by status
- `client.refunds.approve()` — transition to approved
- `client.refunds.reject()` — transition to rejected with notes
- `client.refunds.process()` — transition to processed with method and reference
- `client.auditLogs.list()` — fetch audit trail for refund

**Uses these components:**
- `DataTable` from `@/components/tables/sales/view/data-table` — renders refund table
- `StatusBadge` — status display (mapped via REFUND_STATUS_MAP)
- `CopyableCell` — refund number
- `RefundDetailDrawer` — side panel with refund details and audit trail
- `ProcessRefundDialog` from `@/components/refunds/process-refund-dialog` — process method selection
- `RejectDialog` (inline) — rejection notes input
- `Link` — navigation to sales order detail if applicable
- Sheet, Button, Dialog, Textarea, Separator — shadcn/ui

**Uses these hooks:**
- `useUserContext()` — org ID, permission checks (refund_management:read, :approve, :process)
- `useQuery` (React Query) — fetch refunds and audit logs
- `useMutation` (React Query) — approve/reject/process mutations
- `useQueryClient()` — cache invalidation
- `useState` — tab, drawer, dialog state

**Navigation: who navigates here:**
- Sidebar link
- Direct URL

**Navigation: where it goes:**
- TargetCell renders Link to `/dashboard/sales/$id` for sales order refunds
- No other navigation

---

## 4. Data Shapes

**DB tables touched:**
- `refunds` (select, update)
- `auditLogs` (select, where entityType = 'refund')

**Key types / Zod schemas:**
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
  refundMethod: string | null; // "cash" | "card_reversal" | "bank_transfer" | "store_credit"
  refundReference: string | null;
  customerId: string;
  customerName: string;
  requestedByName?: string | null; // enriched from backend join
  salesOrderNumber?: string | null;
};

// API list response
{
  rows: RefundRow[];
  total: number;
}

// API approve input
{
  organizationId: string;
  id: string;
  reviewNotes?: string;
}

// API reject input
{
  organizationId: string;
  id: string;
  reviewNotes: string;
}

// API process input
{
  organizationId: string;
  id: string;
  refundMethod: "cash" | "card_reversal" | "bank_transfer" | "store_credit";
  refundReference?: string;
}
```

---

## 5. Tests

**Test files:** None found (none matching refund pattern in `__tests__/`)

**Scenarios covered:** (none currently)

**Not tested (risk areas):**
- Tab filtering logic
- Approve/reject/process mutations
- Audit trail loading and display
- Permission checks (refund_management:read, :approve, :process)
- Error handling for failed mutations
- Edge cases: null audit rows, missing customer names, target resolution

---

## 6. Notes

- **Status mapping:** "processed" mapped to canonical "completed" with label override. "pending", "approved", "rejected", "cancelled" map directly.
- **TargetCell logic:** Prioritizes salesOrderId > paymentId > packageInstanceId; displays as link to sales order if available.
- **Audit trail:** Fetched only when detail drawer is open (`enabled: open && !!refund?.id`).
- **Rejection notes:** Required (min 1 char) for reject action.
- **Process method:** "cash" optional for reference; others require it.
- **Permissions:** Read requires `refund_management:read`; approve requires `:approve`; process requires `:process`.
- **Currency:** All amounts stored in cents (amountCents, taxAmountCents); formatted via `formatPrice()` for display.
- **Async issue:** The field `(data as any)?.rows` in auditQuery suggests type mismatch; audit logs endpoint returns `{ rows: [] }` but type isn't explicitly declared.
