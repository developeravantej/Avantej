# Test Plan — 2026-05-25-1313-audit-prove

## Golden Paths (one per major route)
Order: auth first, then read-only views, then writes.

| ID | Route | Journey |
|---|---|---|
| GP-01 | /dashboard | Dashboard Home loads — KPI cards visible, no JS errors |
| GP-02 | /dashboard/operations/approvals | Approvals page loads — pending package list visible |
| GP-03 | /dashboard/customers/view | Customer list loads — table with rows visible |
| GP-04 | /dashboard/appointment/view | Appointment calendar loads — date picker and branch filter visible |
| GP-05 | /dashboard/appointment/class-slots/view | Class Slots view loads — list or empty state visible |
| GP-06 | /dashboard/trainers/availability | Trainer Availability view loads — availability grid visible |
| GP-07 | /dashboard/service/view | Services list loads — at least one service row visible |
| GP-08 | /dashboard/sales/create | POS — walk-in + one custom item → Payment → cash tender → Confirm |
| GP-09 | /dashboard/reports/view | Reports view loads — scheduled reports or empty state visible |
| GP-10 | /dashboard/announcements/view | Announcements — create new announcement → appears in list |
| GP-11 | /dashboard/sales/view | Sales list loads — order table with stats visible |
| GP-12 | /dashboard/payment/view | Payment History loads — transaction table visible |
| GP-13 | /dashboard/cancelled-sales/view | Cancelled Sales loads — cancelled order table visible |
| GP-14 | /dashboard/payouts/view | Payouts view loads — table visible |
| GP-15 | /dashboard/refunds/view | Refunds view loads — refund request list visible |
| GP-16 | /dashboard/commissions/view | Commissions view loads — commission splits table visible |
| GP-17 | /dashboard/settings/tax-rates | Tax Rates settings loads — rate list visible |
| GP-18 | /dashboard/packages/installments/view | Installment Plans view loads — plan list visible |
| GP-19 | /dashboard/expenses/view | Expenses view loads — expense table visible |
| GP-20 | /dashboard/products/view | Products list loads — product table visible |
| GP-21 | /dashboard/packages/instances/view | Packages view loads — instance tabs visible |
| GP-22 | /dashboard/trainers/view | Trainers list loads — trainer rows visible |
| GP-23 | /dashboard/user/view | Employees list loads — member rows visible |
| GP-24 | /dashboard/attendance/view | Attendance view loads — today's bookings visible |
| GP-25 | /dashboard/access-control/roles | Roles list loads — role table visible |
| GP-26 | /dashboard/access-control/user-assignment | Staff Access loads — member list visible |
| GP-27 | /dashboard/branch/:id | Branch detail page loads (navigate from sidebar) |
| GP-28 | /dashboard/onboarding/view | Onboarding QR view loads — QR code visible |

## Finding Journeys (testable findings — assert CORRECT behaviour)

| ID | Source | Journey | Persistence check |
|---|---|---|---|
| F-HOME-01 | bulkApprove missing staff insert | Bulk-approve 2+ pending packages → verify each has package_instance_staff row | API read-back: GET package details |
| F-HOME-02 | bulkReject no notification | Bulk-reject 2+ pending packages → verify notification created per customer | API read-back: notifications list |
| F-HOME-03 | scheduledReports.list unguarded | As non-admin staff: call reports.list → should get 403 | API assertion |
| F-HOME-05 | listPending pre-LIMIT filter | Approvals page count matches badge count (not truncated at 50) | UI assertion |
| F-CUST-01 | no_show commission mismatch | Mark appointment as no-show → commission split created | API read-back: commission splits |
| F-CUST-02 | waitlist promote no appointment | Promote waitlist entry → appointment row exists | API read-back: appointments list |
| F-CUST-03 | cancelEnrollment skips credit | Cancel class enrollment → package credits restored | API read-back: package instance credits |
| F-CUST-04 | computeAvailableSlots ignores exceptions | Add trainer exception → availability shows blocked | UI assertion |
| F-CUST-05 | series-cancel wrong RBAC | User with only update permission can cancel appointment series | UI: action available |
| F-POS-02 | cancel sale no Stripe refund | Cancel a sale order → cancellation confirmed in UI | UI assertion |
| F-POS-03 | cancelled pkg instances active | Cancel a sale with package → package instance status = cancelled | API read-back: package instance |
| F-POS-04 | Email button stub | POS receipt → Email receipt button click → does not show unimplemented error | UI assertion |
| F-FIN-01 | processCommissionReversals orphan | Approve refund on sale with commission → commission reversal visible in payouts | API read-back: payouts |
| F-FIN-02 | markPaidById drops paymentReference | Mark commission paid with reference "REF-001" → reference saved | API read-back: commission split |
| F-FIN-04 | rejectExpense drops rejectedBy | Reject expense → status = rejected (basic: at minimum status saved) | API read-back: expense |
| F-STAFF-02 | role deletion dangling roleId | Delete a custom role → assigned members get null roleId or error | API read-back: members with that role |
| F-STAFF-04 | assertTenantAndMember empty | Any google-calendar procedure call without tenant ctx → 401/403 not crash | API assertion |

## Persistence checks (API read-back mode — db.verifyMode fallback)

All persistence checks use API read-back since direct DB requires integration test env.
Each finding's spec step posts to the relevant RPC endpoint after the UI action and asserts the saved state.

## Ordering
1. Login (storageState) — handled by setup project
2. GP-01..GP-28 (read-only views, fast)
3. GP-08 POS write journey (needs clean test data)
4. GP-10 Announcement create
5. F-CUST-01, F-CUST-02, F-CUST-03, F-CUST-04, F-CUST-05 (scheduling mutations)
6. F-HOME-01, F-HOME-02, F-HOME-03, F-HOME-05 (approvals mutations)
7. F-POS-02, F-POS-03, F-POS-04 (sales mutations)
8. F-FIN-01, F-FIN-02, F-FIN-04 (finance mutations)
9. F-STAFF-02, F-STAFF-04 (access control mutations — role delete is destructive, do last)
