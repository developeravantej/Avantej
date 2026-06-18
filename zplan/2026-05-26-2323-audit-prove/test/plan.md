# Test Plan — 2026-05-26

## Golden paths (load+render smoke)

| ID | Journey | Route |
|---|---|---|
| GP-01 | Dashboard home loads KPI cards | /dashboard |
| GP-02 | Customers v2 directory renders list | /dashboard/customers/v2/view |
| GP-03 | POS flow opens, selects service, submits cash sale | /dashboard/sales/create |
| GP-04 | Appointments calendar renders | /dashboard/appointment/view |

## Finding journeys (assert CORRECT behaviour)

| ID | Finding | Journey | Assertion |
|---|---|---|---|
| F-AC-01 | Households privilege escalation | Log in as scoped staff with empty accessibleNodeIds; call households.list via API; assert response is [] | Empty array returned, not all households |
| F-AC-02 | walk-in-customers.list | Navigate to walk-in page (if exists); assert API call returns {items:[], total:0} but doesn't crash | Consistent empty response |
| F-AC-04 | updateRole missing audit log | Update a member's role; check audit_logs endpoint for a matching entry | Audit log entry exists |
| F-SP-01 | POS stripe without Stripe configured | Attempt POS checkout with paymentMethod=stripe on an org without Stripe; assert error toast | Error returned, sale not created |
| F-SP-02 | Installment reschedule lock | Reschedule an overdue installment to a past date; assert package remains in correct state | Installment re-evaluated |
| F-SP-03 | Promo re-validation | Validate promo code; deactivate it via admin; submit POS checkout using cached code; assert error | Error returned, sale rejected |
| F-SP-04 | Tax rate zero default | Submit POS sale on org with no active tax rate; assert error or explicit zero-tax confirmation | Should not silently zero-tax |
| F-AP-01 | Waitlist race condition | Add member to waitlist; promote from waitlist; verify class slot spotsBooked ≤ capacity | spotsBooked within capacity |
| F-AP-02 | Client recurrence list | Create recurring appointment; log in as client; call listForUser; assert occurrences expanded | Virtual occurrences in response |
| F-AP-03 | Check-in invalid appointmentClientId | Submit recordCheckIn with non-existent appointmentClientId; assert BAD_REQUEST | Error returned |
| F-AP-04 | Class slot capacity reduce below booked | Enroll member in class slot; try to reduce capacity below enrolled count; assert error | Validation error returned |
| F-AP-05 | Reschedule into trainer exception | Add trainer availability exception; reschedule appointment into exception window; assert conflict | Conflict error returned |
| F-PS-01 | First installment without payment proof | Bulk approve installment package; verify first installment status and paymentMethod | Payment proof required or explicit method |
| F-PS-02 | setBranchPrice null bypass | As regional admin, call setBranchPrice with branchId=null; assert FORBIDDEN | FORBIDDEN error |
| F-PS-03 | Trainer tier commission rates | Create new trainer tier; assert commission_tier_rates stub rows created via API read | Rates scaffolded |
| F-OF-01 | Goods receipt PO status | Create goods receipt for PO; verify PO status advances to partially_received | PO status updated |
| F-OF-02 | Payout batch unapproved splits | Create pending commission split; run payout batch; assert pending splits excluded | Batch skips pending splits |
| F-ST-01 | Announcement no notification | Create announcement with member scope; check notifications endpoint for members in scope | Notification records created |
| F-ST-04 | Member reassignment out-of-scope | As regional manager, reassign member to out-of-scope branch; assert FORBIDDEN | FORBIDDEN error |

## Persistence checks (API read-back)

| Check | Finding | Table | Assertion |
|---|---|---|---|
| PC-AC-01 | F-AC-01 | households | Scoped staff sees [] |
| PC-AP-01 | F-AP-01 | class_slots.spotsBooked | ≤ capacity after promotion |
| PC-PS-02 | F-PS-02 | service_price_overrides | No null-branchId row created |
| PC-OF-01 | F-OF-01 | purchase_orders.status | Advances on receipt creation |
