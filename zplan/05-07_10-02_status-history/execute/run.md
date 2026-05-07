# Status History Timelines — Execution Run

**Date:** 2026-05-07
**Session:** 05-07_10-02_status-history
**Executor:** Claude Sonnet 4.6

---

## Summary

Most of the plan was already implemented by prior work. This run completed the remaining gaps
found during audit.

---

## Pre-existing (already done before this run)

- `packages/api/src/lib/cursor.ts` — `encodeCursor` + `parseCursor` with `lastIndexOf("|")`
- `packages/services/src/sales-order.service.ts` — `getSalesOrderStatusHistory`
- `packages/services/src/appointment.service.ts` — `getAppointmentStatusHistory`
- `packages/services/src/package-instance.service.ts` — `getPackageInstanceStatusHistory`
- `packages/services/src/payments.service.ts` — `getPaymentStatusHistory` (new file, already created)
- `packages/services/src/index.ts` — all four service functions exported
- `packages/api/src/routers/sales-orders.ts` — `statusHistory` procedure with `"sales"` permission
- `packages/api/src/routers/appointments.ts` — `statusHistory` procedure with `"appointment_management"` permission
- `packages/api/src/routers/package-instances.ts` — `statusHistory` procedure with `"sales"` permission
- `packages/services/src/installment.service.ts` — `evaluateAndExpireIfOverdue` already patched to call `appendPackageInstanceStatusHistory`
- `apps/web/src/components/ui/status-timeline.tsx` — reusable `StatusTimeline` component
- `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx` — `StatusHistoryCard` inline below invoices card
- `apps/web/src/components/appointments/appointment-list.tsx` — `AppointmentStatusHistory` component + Dialog with history section on row click
- `apps/web/src/components/pages/packages/instances-page.tsx` — `PackageInstanceHistory` component + `historyInstanceId` state + row click sets it

---

## Changes made in this run

### 1. `packages/api/src/routers/invoices.ts`
Added `paymentStatusHistory` procedure to `invoicesRouter`:
- Input: `{ organizationId, paymentId, cursor?, limit? }`
- Permission: `requirePermission(context.tenantDb, context.member, "payments", "read")`
- Calls `getPaymentStatusHistory` service, applies N+1 cursor detection, batch-resolves names
- Returns `{ rows, nextCursor }` — raw `changedBy` UUID stripped from response

### 2. `apps/web/src/components/pages/packages/instances-page.tsx`
Added the missing status history Dialog that `historyInstanceId` state was pointing to but never rendered:
- Dialog opens when `historyInstanceId !== null` (set by existing row-click handler)
- Renders `PackageInstanceHistory` sub-component inside the dialog
- Uses `History` icon already imported from lucide-react

### 3. `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx`
Built the complete payment history Sheet:
- Added `PaymentHistoryPanel` sub-component (calls `client.invoices.paymentStatusHistory`)
- Added `selectedPaymentId` state
- Added Dialog that opens when `selectedPaymentId` is set
- Updated `paymentsData` map to populate `payment_id` from `item.paymentId`
- Uses `buildColumns(onHistoryClick)` instead of static `columns`

### 4. `apps/web/src/components/tables/payment/view/columns.tsx`
- Added `payment_id?: string | null` to `PaymentRow` interface
- Added `History` to lucide-react imports
- Refactored `PaymentActionCell` to accept `onHistoryClick?: (paymentId: string) => void`
- Added conditional "History" button in actions cell (only shown when `payment_id` is present)
- Extracted `buildColumns(onHistoryClick?)` factory function
- Kept backward-compat `columns` export (`buildColumns()` with no handler)

---

## Key decisions

1. **`package_management` resource** — used `"sales"` as the gating permission (pre-resolved in plan).
2. **`paymentStatusHistory` placement** — added to `invoicesRouter` as `client.invoices.paymentStatusHistory(...)`, not a separate router (pre-resolved in plan).
3. **History trigger in payment view** — added a "History" button in the actions column (only visible for rows with a `paymentId`) rather than making the whole row clickable, to avoid conflicting with the existing "View" navigation action.
4. **`buildColumns` factory** — avoided mutating the existing static `columns` export; the factory pattern lets the caller pass the history callback cleanly.

---

## Type-check result

`bun check-types` reports zero new errors in any of the four files modified in this run.

All errors reported by the type checker are pre-existing in:
- `apps/server/src/tests/` (bun:test module resolution)
- `packages/api/src/routers/payouts.ts` (implicit `any`)
- `packages/api/src/routers/service-members.ts` (implicit `any`)
- `apps/web/src/components/` (various pre-existing issues: `firstName`, `addedAt`, etc.)

None are in: `invoices.ts`, `payment/view.tsx`, `payment/view/columns.tsx`, `instances-page.tsx`.
