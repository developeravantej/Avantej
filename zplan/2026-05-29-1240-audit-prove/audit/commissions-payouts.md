# Domain: Commissions & Payouts Audit

## Endpoints Summary

### commission-splits/read.procedures.ts
- list: commission_management:read → listCommissionSplits
- getByAppointment: commission_management:read → getCommissionsByAppointment
- getMyCommissions: commission_management:read → getMyCommissions (F-COM-A: uses member.userId)
- listLedger: commission_management:read → listCommissionLedger

### commission-splits/lifecycle.procedures.ts
- approve: commission_management:approve → approveCommissionSplits
- markPaid: commission_management:process → markCommissionSplitsPaid
- void: commission_management:approve → voidCommissionSplit
- createManualAdjustment: commission_payout:create → createManualAdjustment
- markPaidBatch: commission_payout:update → markPaidBatch
- markPaidById: commission_management:process → markCommissionSplitsPaid
- voidById: commission_management:approve → voidCommissionSplit

### commission-splits/analytics.procedures.ts
- liabilitySummary: commission_management:read OR commission_payout:read → liabilitySummary
- liabilityByStaff: commission_management:read → liabilityByStaff

### commission-splits/review.procedures.ts
- listPendingReview: commission_management:read → listPendingReview
- resolveReview: commission_review:resolve → resolvePendingReview

### analytics.ts
- getDashboardKpis: reports:read → getDashboardKpis
- getStaffPerformance: reports:read → getStaffPerformance
- getRevenueSeries: reports:read → getRevenueSeries
- getMemberCountSeries: reports:read → getMemberCountSeries
- getChurnSeries: reports:read → getChurnSeries
- getLtvSeries: reports:read → getLtvSeries
- getClassFillRateSeries: reports:read → getClassFillRateSeries

### scheduled-reports.ts
- list: reports:read → listScheduledReports
- create: reports:export → createScheduledReport
- delete: reports:export → deleteScheduledReport
- toggle: reports:export → toggleScheduledReportActive

### partner-stripe.ts
- createOnboardingUrl: protected → signPartnerOAuthState, buildPartnerOnboardingUrl
- getStatus: protected → (direct DB read)
- refresh: protected → deriveStripeConnectStatus
- confirmViaStripe: protected → confirmPayoutViaStripe
- confirmAllViaStripe: protected → confirmAllPayoutsViaStripe

## Critical Gaps

### P1: pending_review State Unreachable (status:partial, testable:true)
- listPendingReview + resolveReview endpoints exist but no UI integration found
- createManualAdjustment creates pending_review splits but no caller in UI
- Review tab will always be empty if manual adjustments not called
- File: packages/api/src/routers/commission-splits/lifecycle.procedures.ts:118

### P1: Stripe Transfer Not Executed (status:partial, testable:false)
- confirmViaStripe does NOT validate payout.status before calling confirmPayoutViaStripe
- No webhook handler for transfer.created events documented
- Payouts marked "paid" locally but never settle on Stripe
- File: apps/server/src/routers/partner-stripe.ts:328-340

### P1: No Sweep Job for Pending Payouts (status:missing, testable:false)
- Splits can stay linked to pending payouts indefinitely
- No webhook handler for Stripe transfer failures
- No automated aging/reconciliation job
- File: packages/services/src/payouts.service.ts

### P2: POS Cap Enforcement Unverified (status:partial, testable:true)
- Appointment path enforces caps via applyCommissionCaps
- POS hot path (calculateCommissionForPos) comment admits guard is "read-only in scope"
- POS commissions may exceed per-cycle limits
- File: packages/services/src/commission-calculator.service.ts:536-538

### P2: Manual Adjustment Approval Split Permission (status:partial, testable:true)
- createManualAdjustment needs commission_payout:create
- resolveReview needs commission_review:resolve (different)
- Operators with create permission may not be able to approve
- File: packages/api/src/routers/commission-splits/lifecycle.procedures.ts:134, review.procedures.ts:69

### P2: No Idempotency for Batch Runs (status:partial, testable:false)
- runBatch retries on conflict but no transparent deduplication
- confirmAllViaStripe has no resumption logic after network flakes
- Network flakes leave half-confirmed payouts orphaned
- File: packages/services/src/payouts.service.ts:504-518, partner-stripe.ts:367-404

### P2: staffId Convention Fragile (status:partial, testable:true)
- getMyCommissions passes member.userId (F-COM-A fix) but no regression test
- One-character change could reintroduce bug silently
- File: packages/api/src/routers/commission-splits/read.procedures.ts:85

### P2: liabilityByStaff Silently Truncates (status:partial, testable:true)
- LIMIT 500 with no totalCount or hasMore flag
- Large orgs with 600+ trainers see 500 with no indication of truncation
- Finance team may underpay if unaware
- File: packages/api/src/routers/commission-splits/analytics.procedures.ts:83

### P3: No Amount Check on markPayoutPaid (status:partial, testable:false)
- Only paymentReference required; no amount confirmation
- Operator can mark wrong amount as paid
- Accidental overpayment goes unnoticed
- File: packages/services/src/payouts.service.ts:688

### P3: Branch Scope Not Enforced in Stripe Onboarding (status:partial, testable:false)
- createOnboardingUrl verifies partner active but no guardBranchAccessible check
- Cross-branch operator could onboard partner they shouldn't access
- File: apps/server/src/routers/partner-stripe.ts:89-102

### P3: No Auto-Retry for Stripe Failures (status:missing, testable:false)
- confirmPayoutViaStripe throws ConfirmPayoutError without retry
- Network flakes require manual operator intervention
- File: partner-stripe.ts:303-357

## Testable Findings Count: 6

1. P1: pending_review unreachable (status:partial, testable:true)
2. P2: POS cap unverified (status:partial, testable:true)
3. P2: Approval permission split (status:partial, testable:true)
4. P2: staffId convention fragile (status:partial, testable:true)
5. P2: liabilityByStaff truncates (status:partial, testable:true)
6. P3: No markPayoutPaid amount check (status:partial, testable:false) ← [1 false]

**Corrected: 5 testable:true, 6 testable:false**
