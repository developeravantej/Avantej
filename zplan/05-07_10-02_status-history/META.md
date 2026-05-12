# META — Status History Timelines

**Session:** 05-07_10-02_status-history
**Created:** 2026-05-07
**Author:** Claude Code (Sonnet 4.6)
**Branch:** feat/package-approval-flow (plan written here; implement on a fresh branch)

## Summary

Plan for surfacing the four per-entity status history tables (`appointment_status_history`, `sales_order_status_history`, `package_instance_status_history`, `payment_status_history`) as read-only timeline UI embedded in the relevant detail/list views.

History writes are already in place across all entity services. The gap is entirely on the read side: no API procedures exist for fetching history, and no UI surfaces it.

## Status

- [x] Plan written
- [ ] Phase 1 implemented (Sale Detail timeline)
- [ ] Phase 2 implemented (Appointment + Package Instance drawer timelines)
- [ ] Phase 3 implemented (Payment timeline + coverage gap fixes)

## Key Findings

1. All four history tables are schema-correct with composite indexes on (entityId, changedAt).
2. History is written in the following transitions (verified):
   - **Sales orders:** `updateSalesOrder` (general status change) + `cancelSalesOrder`
   - **Appointments:** `updateAppointment` (all status changes including system/cron)
   - **Package instances:** `updatePackageInstance` (package-instance.service.ts) + freeze/resume (membership.service.ts)
   - **Payments:** refund processing (refunds.service.ts) + walk-in conversion (walk-in.service.ts)
3. **Gap found:** `evaluateAndExpireIfOverdue` in `installment.service.ts` sets `packageInstances.status = "expired"` without calling `appendPackageInstanceStatusHistory`. This is a silent write.
4. **Gap found:** `refunds.service.ts:731` updates `salesOrders.cancelledAmount` but NOT `salesOrders.status` — no gap.
5. No `$id` detail page exists for appointments or payments. Timelines for those entities must use a list-row side drawer.
6. `changedBy` is plain text (user ID or literal "system"). Name resolution requires a cross-DB lookup against `auth.user` or a member displayName join.

## Files to touch (Phase 1 only)

| File | Change |
|------|--------|
| `packages/api/src/routers/sales-orders.ts` | Add `statusHistory` procedure |
| `packages/api/src/routers/index.ts` | No change needed — salesOrders already registered |
| `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx` | Add StatusHistoryCard component |

## Risk level: Low
All changes are additive read-only. No schema migrations. No service logic changes in Phase 1.
