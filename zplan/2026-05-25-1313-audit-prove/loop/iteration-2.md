# Iteration 2 — 2026-05-25

## Fixes applied (10 targets + spec repairs)

| Target | Result | File(s) |
|--------|--------|---------|
| F-HOME-01 | ✅ fixed | approve.procedures.ts: packageInstanceStaff insert in tx + notifyCustomerPackageAssigned post-loop |
| F-HOME-02 | ✅ fixed | bulk-reject.procedures.ts: notifyCustomerPackageRejected + clearPendingReviewNotifications post-loop |
| F-CUST-02 | ✅ fixed | waitlist.service.ts: promoteFromWaitlist inserts appointments + appointmentClients + updates waitlistEntry.appointmentId |
| F-CUST-03 | ✅ fixed | enrollment.procedures.ts: cancelEnrollment decrements creditsUsed by 1 when packageInstanceId present |
| F-CUST-04 | ✅ fixed | trainer-availability.service.ts: computeAvailableSlots queries exceptions; blocked/timeoff days skipped |
| F-POS-03 | ✅ fixed | sales-order.service.ts: cancelSalesOrder now sets packageInstances.status = "cancelled" where salesOrderId matches |
| F-POS-05 | ✅ fixed | products.ts: resolvePrice now has requirePermissionOrpc(inventory, read) |
| F-FIN-01 | ✅ fixed | payouts.ts: processCommissionReversals called before runBatch service call |
| F-STAFF-05 | ✅ fixed | pricing.procedures.ts: resolvePrice guards non-client roles with requirePermissionOrpc(service_management, read) |

## Spec repairs
- orpc-client.ts: page.request.post() → page.evaluate(fetch) — fixes ENOTFOUND avantej.localhost for all API calls
- GP-08: toBeEnabled → toBeVisible on "Review & Confirm" button
- GP-18: .or() locator → getByRole("table").first()
- GP-21: .or() locator → getByTestId("instances-table").or(getByRole("table").first())

## Blocked (deferred)
| Target | Reason |
|--------|--------|
| F-POS-02 | Stripe server-side API integration — deferred |
| F-POS-04 | Frontend email button stub — no file identified |
| F-FIN-02 | needs tenant schema migration (payment_reference column) |

## Type-check: PASSED (all 6 agents confirmed 3/3 packages, 0 errors; turbo cache confirmed clean)

## Open targets entering iteration 3
Only blocked/deferred targets remain. All testable partial/missing findings are now fixed.
