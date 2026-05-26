# Domain sales-pos-payments

## Endpoints / Procedures Summary

**API Surface:** 57 endpoints across 12 router files  
**Logic Functions:** 64 functions across 6 service files  

### Key Routers
- **POS:** recordSale (atomic), searchCustomers, getReceiptData
- **Sales Orders:** list, getById, create, update, cancel, statusHistory, kpiSummary, largestToday, getLatest
- **Installments:** confirmPayment, listByPackageInstance, manualUnlock, processRefund, adminOverview, getEvents, suggestRefund, adjustCredits, setOverdraft, reschedule, waive, resetOverride
- **Installment Plans:** list, getById, getByCode, create, update, setDefault, deactivate, reactivate
- **Promotions:** list, validate, apply, create, update, deactivate
- **Tax Rates:** list, getById, getDefault, create, update, setDefault, deactivate
- **Invoices:** list, getById, create, update, paymentStatusHistory
- **Cancelled Sales:** list, getById, exportCsv
- **Refunds (split 3 files):** request, approve, reject, process, bulkApprove, createPartial
- **Payments (server):** createPaymentIntent, sendPaymentLink, getPaymentStatus, refund, createSetupIntent, listSavedCards, chargeSavedCard, createSalesOrderPaymentLink, purchasePackage
- **Stripe Connect:** createOnboardingUrl, getAccountStatus, listCountryAccounts

---

## Critical Gaps

### P1 — Commission reversal missing in refund→payment flow
**File:** packages/services/src/refunds.service.ts:38  
**Status:** missing | **Testable:** false

When refunds are approved/processed, commission splits from original sale are NOT reversed. Import exists but never called. This causes:
- Overstatement of earnings in commission reports
- Stripe payouts calculated on refunded amounts
- Financial reconciliation failures

**Fix:** Call reverseForRefund in approveRefund/processRefund transaction.

---

### P1 — Payment method support not enforced per org
**File:** packages/api/src/routers/pos.ts:61-65  
**Status:** missing | **Testable:** true

POS recordSale accepts stripe/online paymentMethod but doesn't validate org has Stripe enabled. Creates pending payments that never resolve.

**Fix:** Add org→paymentMethod feature-flag check before inserting payment.

---

### P1 — Partial refund cap validation gap
**File:** packages/services/src/refunds.service.ts:400-450  
**Status:** missing | **Testable:** false

Series of partial refunds could exceed original total if not sequenced carefully. computeRemaining* functions have edge-case validation gaps.

**Fix:** Add explicit check: sum(all_refunds.amountCents) <= original_target_amount.

---

### P2 — Installment overdue→locked validation missing on reschedule/waive
**File:** packages/api/src/routers/installments.ts:340-392  
**Status:** partial | **Testable:** true

Rescheduled installment can have past due-date without re-locking. Admin waive doesn't trigger unlock if all remaining are now paid/waived.

**Fix:** Re-call evaluateAndLockIfOverdue after reschedule. Check total-paid after waive.

---

### P2 — Missing audit trail for payment status when refund processes
**File:** packages/services/src/refunds.service.ts:648+  
**Status:** partial | **Testable:** true

Refund writing back to payments.refundAmount has no payment_status_history entry. Payment history reports don't show refund transition.

**Fix:** Call appendPaymentStatusHistory when processRefund updates payments row.

---

### P2 — Tax rate defaulting allows silent zero-tax sales
**File:** packages/services/src/pos.service.ts:378-388  
**Status:** partial | **Testable:** true

When no taxRateId provided and no branch/org default exists, taxCents defaults to 0 without user confirmation. Silent configuration error risk.

**Fix:** Require explicit isActive tax rate or reject with BAD_REQUEST.

---

### P2 — Promotion deactivation not re-validated before apply
**File:** packages/services/src/promotions.service.ts (validate vs apply)  
**Status:** partial | **Testable:** true

Frontend can cache validatePromoCode result; if promo deactivated before recordPosSale, stale validation allows false application.

**Fix:** Re-validate in applyPromotion or inline in recordPosSale (no separate apply call).

---

### P3 — Promotion usage not adjusted for partial refunds
**File:** packages/services/src/pos.service.ts:577-599  
**Status:** missing | **Testable:** false

promotionUsages records full discount; partial refund never adjusts the row. Per-customer limits count phantom usage. No adjusted_amount column in schema.

**Fix:** Track refund amount in promotionUsages or subtract from usageCount when refund processes.

---

### P3 — Installment pricePremiumBps creates schedule imbalance
**File:** packages/services/src/pos.service.ts:399-404  
**Status:** partial | **Testable:** true

High pricePremiumBps can make first installment (absorbing rounding) drastically differ from others. No minimum-amount validation.

**Fix:** Validate first installment amount >= some reasonable minimum (e.g., 100 cents).

---

### P3 — Cancelled sales materialization incomplete
**File:** packages/api/src/routers/cancelled-sales.ts  
**Status:** partial | **Testable:** true

cancelSalesOrder sets status='cancelled' but may not denormalize to cancelled_sales table if one exists. Reporting gaps if view is stale.

**Fix:** Verify schema strategy for cancelled_sales materialization.

---

## Endpoint/Logic Mapping (Sample)

| Endpoint | Logic | Status | Risk |
|----------|-------|--------|------|
| recordSale | recordPosSale | implemented | Commission tracking unvalidated |
| approve (refund) | approveRefund | partial | Commission reversal missing |
| process (refund) | processRefund | partial | No payment_status_history audit |
| confirmPayment | confirmInstallmentPayment | implemented | Overdue validation happens in listByPackageInstance, not confirmPayment |
| reschedule | rescheduleInstallment | partial | No grace-period re-eval after reschedule |

---

## Summary

- **Total Endpoints:** 57 across 12 routers
- **Total Logic Functions:** 64 in 6 service files
- **Testable Findings:** 8 (P2-P3 mostly)
- **Critical Blockers (P1):** 3 missing functions (commission reversal, payment-method validation, partial-refund cap)
- **High-Risk Partial:** 5 (reschedule validation, payment audit, tax default, promo revalidation, pricePremiumBps imbalance)

**Top Actions:**
1. Implement commission reversal in refund lifecycle (missing, high impact)
2. Add org-level payment-method feature-flag check (missing, prevents orphaned pending payments)
3. Strengthen partial-refund cap validation (missing, prevents over-refunds)
4. Add payment_status_history when refund processes (partial, audit completeness)
5. Require explicit tax rate or reject null default (partial, prevents silent zero-tax sales)
