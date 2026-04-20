# Commissions Ledger

**Route:** `/dashboard/commissions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx:1`
**Platform:** web
**Auth required:** authenticated + `commission_management:read`
**Last updated:** 2026-04-19

---

## 1. What It Does

**Purpose:** Per-staff commission ledger with status workflow (pending → approved → paid). Ops bulk-approves then marks paid at end of period.

**Produces:** KPI strip (Pending Total, Approved Total, Paid Total) + tabbed table (All / Pending / Approved / Paid / Void) + filters (staff, branch, date range). Bulk checkbox selection.

**On success:** Bulk Approve / Mark Paid / Void mutations fire per-tab; audit rows land; KPIs refresh.

---

## 2. How It Works

**Execution flow:**
```
Filter/tab change → useQuery(["commissionLedger", filters])
  → client.commissionSplits.listLedger({ organizationId, status, staffId?, branchId?, from?, to? })
    → commissionSplitsRouter.listLedger    # rbac: commission_management:read
      → listCommissionLedger()
        → commission_splits LEFT JOIN appointments + sales_orders (for branchId + source)
        → in-memory RBAC filter on branchId ∈ accessibleNodeIds
        → cross-DB staff name enrichment
        → compute totals { pending, approved, paid }

Bulk actions:
- Pending tab: Approve Selected → approveCommissionSplits(ids)
- Approved tab: Mark Paid → MarkPaidDialog → markCommissionSplitsPaid(ids, { payoutMethod, payoutReference, payoutId? })
- Any tab: Void Selected → reason modal → voidCommissionSplit per row
```

---

## 3. What Depends On It

**API endpoints:**
- `commissionSplits.listLedger` — new in P6
- `commissionSplits.approve`, `commissionSplits.markPaid`, `commissionSplits.void`
- `commissionSplits.getMyCommissions` — reused by `commissions/my`

**Components:**
- `BulkActionBar`, `MarkPaidDialog` — `apps/web/src/components/commissions/`

**Write-side triggers (currently NO-OP — see Notes):**
- `appointment.service.ts:updateAppointment` — scaffold to create splits on status='completed'
- `pos.service.ts:recordPosSale` — scaffold to create split for salesperson

**Navigation: incoming:** Sidebar under Sales & Finance > Commissions.

---

## 4. Data Shapes

**Key table:** `commission_splits` (altered in migration 0024)
- `appointmentId` (nullable) OR `salesOrderId` (XOR via CHECK constraint)
- `status`: `pending` | `approved` | `paid` | `void`
- Approval: `approvedBy`, `approvedAt`
- Payment: `paidBy`, `paidAt`, `payoutId` (nullable ref to payouts, no Drizzle FK to avoid circular import)
- Partial unique indexes: `(appointment_id, staff_id)` and `(sales_order_id, staff_id)` — each WHERE NOT NULL

**staffId = `members.userId` (cross-DB control-panel user ID), NOT tenant `member.id`.** Consistent with `appointmentStaff.staffId` and `payouts.recipientId`.

---

## 5. Tests

None yet. Chrome-verified: KPI strip RM 0.00 × 3, 5 tabs, filters render, empty state "No results." (expected).

---

## 6. Notes

- **Empty state by design.** Commission auto-create hooks are **scaffolded no-ops** until schema adds `services.commissionPercentage` or `serviceCommissionConfig` table (Open Question 6). Both hooks log `console.warn` + TODO. Ledger displays 0 rows until config source exists.
- `listCommissionLedger` does in-memory RBAC (not SQL WHERE) — Drizzle LEFT JOIN on nullable FKs without raw SQL is messy; tenant scale makes it fine.
- `createCommissionSplit` is idempotent via `onConflictDoNothing()` + follow-up `findFirst` on duplicate.
- Audit action `commission.mark_paid` (underscore, not camelCase).
- Shipped in tracking-pages plan phase 6 (2026-04-19).
