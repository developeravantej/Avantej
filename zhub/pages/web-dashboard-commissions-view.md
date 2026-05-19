# Commissions Ledger (All Commissions tab)

**Route:** `/dashboard/commissions/view?tab=all` (and `?tab=liability`, `?tab=mine`)
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx`
**Tab components:**
- `apps/web/src/components/pages/commissions/all-tab.tsx` — `AllCommissionsPage`
- `apps/web/src/components/pages/commissions/mine-tab.tsx` — `MyCommissionsPage`
- `apps/web/src/components/pages/commissions/liability-tab.tsx` — `LiabilityTab`
**Platform:** web
**Auth required:** authenticated + (per-tab) `commission_management:read` / `commission_payout:read`
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose:** Per-staff commission ledger with status workflow (pending → approved → paid → void). Ops bulk-approves, then marks paid (batch by trainer over a date range from the Liability tab, or by selecting individual rows on the All tab). Per-row Void is supported from any non-void status with a required audit reason.

**Produces:**
- **All tab:** KPI strip (Pending/Approved/Paid in MYR + counts) + status tabs (All/Pending/Approved/Paid/Void) + filter row (staff dropdown, branch dropdown, from/to date) + selection checkboxes (Pending/Approved tabs only) + `BulkActionBar` + DataTable with Void per-row action.
- **Mine tab:** KPI strip (Pending/Approved/Total Earned) + read-only ledger of own splits.
- **Liability tab:** Date/branch/category filters, sortable trainer table (by netPayableCents desc), CSV export, batch Mark-Paid dialog over a date range.

**On success:** Mutations fire per-tab; audit rows land; KPIs refresh on cache invalidation.

---

## 2. How It Works

**Execution flow (All tab):**
```
AllCommissionsPage
  → useUserContext() → orgId, hasPermission, hierarchy.nodes for branch options
  → useState(activeTab, staffId, branchId, fromInput/Applied, toInput/Applied, selectedIds, voidRowId)
  → useQuery(["members-list", orgId])         // staff dropdown (clients excluded)
  → useQuery(["commissions", orgId, activeTab, filters])
      → client.commissionSplits.listLedger({
            organizationId, status, staffId?, branchId?, from?, to?, limit: 100, offset: 0
        })
  → renders KPI strip + status tabs + filter row + DataTable + (per-row) Void dialog
  → Bulk Approve / Mark Paid happen inside <BulkActionBar/> (commissions/bulk-action-bar.tsx)
  → Void per row → VoidRowDialog → client.commissionSplits.void({ id, reason })
```

**Execution flow (Liability tab):**
```
LiabilityTab
  → date range defaults to firstOfMonth() … today()
  → useQuery(serviceCategories.list)
  → useQuery(commissionSplits.liabilitySummary, { from/to ISO, hierarchyNodeId?, categoryId? })
      → returns { trainers: [...netPayableCents], totals }
  → sort trainers by netPayableCents DESC (useMemo)
  → CSV export builds rows + totals via csvCell() + Blob download
  → MarkPaidDialog → useApiMutation(commissionSplits.markPaidBatch, { memberIds, from, to })
      → invalidates: ["commissionLiability"], ["commissions"], ["my-commissions"]
```

**Execution flow (Mine tab):**
```
MyCommissionsPage
  → useQuery(["my-commissions", orgId]) → client.commissionSplits.getMyCommissions({ orgId })
  → derives KPIs client-side (filter by status, sum calculatedAmount)
  → renders DataTable with emptyTitle / emptyDescription props
```

---

## 3. What Depends On It

**API endpoints:**
- `commissionSplits.listLedger` — All tab ledger w/ totals; LEFT JOIN to appointments + sales_orders.
- `commissionSplits.getMyCommissions` — Mine tab.
- `commissionSplits.liabilitySummary` — Liability tab; per-trainer rollup.
- `commissionSplits.void` — single split (any status, with required reason); `commission_management:update`.
- `commissionSplits.markPaidBatch` — Liability tab batch; `commission_payout:update`.
- (Inside `BulkActionBar`) `commissionSplits.approve`, `commissionSplits.markPaid`, `commissionSplits.createManualAdjustment`.
- `members.list`, `serviceCategories.list` — for filter dropdowns.

**Components:**
- `BulkActionBar`, `MarkPaidDialog` — `apps/web/src/components/commissions/`
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx`
- `StatusBadge` (canonical) — `@/components/ui/status-badge`
- `StatusCallout`, `PageLoader` — error / loading
- `CopyableCell` — staff ID
- Local components: `KpiCard`, `SourceCell`, `VoidRowDialog` (in all-tab.tsx)
- Local components: `MarkPaidDialog` (in liability-tab.tsx)

**Hooks:**
- `useApiMutation` — wraps `useMutation` with success/error toast + invalidate keys (Liability mark-paid, Mine refetch, etc.)
- `useUserContext` — perms + hierarchy nodes

**Money helpers:** `formatPrice(cents, "MYR")` and `centsToRm(cents)` from `@/lib/money` (Liability tab CSV uses `centsToRm` for plain-number columns).

**Write-side commission triggers (server-side, unchanged):**
- `appointment.service.ts:updateAppointment` → `calculateCommissionForAppointment` on status → `completed`; non-fatal.
- `pos.service.ts:recordPosSale` → `calculateCommissionForPos` per service/package line item; non-fatal.

**Navigation incoming:** Sidebar (Sales & Finance > Commissions); `/dashboard/commissions/my` redirect.

---

## 4. Data Shapes

**Key table:** `commission_splits` (migration 0024)
- `appointmentId` (nullable) OR `salesOrderId` (XOR via CHECK constraint).
- `status`: `pending | approved | paid | void`.
- Approval: `approvedBy`, `approvedAt`.
- Payment: `paidBy`, `paidAt`, `payoutId` (nullable; no Drizzle FK to avoid circular import).
- Partial unique indexes: `(appointment_id, staff_id)` and `(sales_order_id, staff_id)`, each WHERE NOT NULL.

**Key types (local to tabs):**
```typescript
// all-tab.tsx
type CommissionLedgerRow = {
  id, staffId, staffName, appointmentId, salesOrderId,
  appointmentNumber?, salesOrderNumber?, serviceName?, branchId?, branchName?,
  splitPercentage, calculatedAmount, status,
  notes, createdAt, approvedBy, approvedAt, paidBy, paidAt, payoutId
};
type ActiveTab = "all" | "pending" | "approved" | "paid" | "void";

// liability-tab.tsx
type TrainerLiabilityRow = {
  memberId, name,
  approvedUnpaidCents, paidCents, manualAdjustmentCents, netPayableCents
};
```

**`staffId` = `members.userId` (control-panel user ID), NOT tenant `member.id`** — consistent with `appointmentStaff.staffId` and `payouts.recipientId`.

---

## 5. Tests

None yet. Chrome-verified: KPI strip RM 0.00 × 3, all 5 status tabs, filters render, empty state "No results." (expected).

---

## 6. Notes

- **Page-shell refactor (May 2026):** The tab band is now built inline in `view.tsx` (rounded card shell + sticky header + scroll region). `ConsolidatedTabs` no longer used. Each tab is a full-page component that owns its own KPI strip + table.
- **All tab additions:** per-row Void button + `VoidRowDialog` (required reason). Tabs that select rows (Pending/Approved) auto-disable selection checkboxes for non-selectable rows.
- **Liability tab additions:** CSV export via Blob/URL.createObjectURL pattern; batch Mark-Paid via `useApiMutation` invalidating `commissionLiability`, `commissions`, and `my-commissions` query keys.
- **Mine tab additions:** Total Earned KPI excludes voids (`activeRows = rows.filter(r => r.status !== "void")`).
- **Commission infrastructure** (unchanged): Two server-side creation paths — appointment completion + POS sale. Config source is `categoryCommissionConfigs` → coach slots + tier rates. Both triggers are non-fatal.
- **Manual adjustments** (`splitType=manual`) land at `status=pending` and require explicit approve. Auto-created splits (`splitType=automatic`) skip pending.
- `listCommissionLedger` does in-memory RBAC filtering on `branchId ∈ accessibleNodeIds` (not SQL WHERE).
- `createCommissionSplit` is idempotent via `onConflictDoNothing()` + follow-up `findFirst` on duplicate.
- Audit action key: `commission.mark_paid` (underscore, not camelCase).
