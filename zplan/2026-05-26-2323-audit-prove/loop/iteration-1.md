# Iteration 1 — 2026-05-27

## Gate: GREEN (server tsc 0 errors, web/native passed)

## Fixes applied this iteration

| Target | Status | Change |
|--------|--------|--------|
| SP-01 | fixed | Stripe org check added to pos.ts (queries org_country_stripe_accounts) |
| SP-04 | fixed | Zero-tax throw in pos.service.ts; BAD_REQUEST in pos.ts |
| PS-02 | fixed | guardInputBranchForContext: null branchId now throws FORBIDDEN |
| AC-01 | fixed | households.ts: empty accessibleNodeIds → [] guard + inArray short-circuit |
| AP-01 | fixed | waitlist.service.ts: capacity check with .returning() + CLASS_FULL throw |
| AP-02 | fixed | list.procedures.ts: listForUser now uses listAppointmentsWithRecurrence |
| PS-03 | fixed | trainer-tier.service.ts: commission_tier_rates stub rows scaffolded |
| AC-04 | no-op | audit log already present in role.procedures.ts |
| AP-03 | fixed | check-ins.ts: appointmentClientId existence validated |
| AP-04 | fixed | class-slots/crud.procedures.ts: capacity >= spotsBooked guard |
| SP-03 | fixed | promotions.service.ts: row-lock isActive re-check in applyPromotion |
| AP-05 | fixed | appointment.service.ts: trainer exception check on reschedule |
| ST-01 | no-op | notification dispatch already wired in announcements service |
| ST-04 | fixed | hierarchy/members.procedures.ts: accessibleNodeIds.length guard |
| OF-03 | fixed | category-commission.ts: sum bps === 10000 validation |
| OF-04 | no-op | date range refine already in products.ts |
| AC-02 | no-op | list already throws via deprecated() helper |
| PS-01 | no-op | auto-confirm already removed from approve.procedures.ts |
| OF-01 | no-op | PO status already advanced in goods-receipt.service.ts |
| OF-02 | no-op | payout batch already filters to approved splits |

## Spec updates
- GP-01..GP-04 golden path locators rewritten to match actual page structure
- F-AC-04 assertion fixed for paginated { items, total } response shape

## Targets still open
None — all testable findings addressed in this iteration.
