# Doc Consistency Audit — Pass 1

**Auditor:** doc-consistency-auditor
**Date:** 2026-05-07

---

## Summary

Several file paths cited in the plan are correct. Two file path discrepancies found. One line number claim is unverifiable but plausible. One phase dependency is implicit but correct.

---

## Findings

### HIGH — Wrong file path for packages instances page component

**Location:** Plan Phase 2, item 8

Plan states:
> `apps/web/src/components/pages/packages/instances-page.tsx`

Actual directory listing of `apps/web/src/components/pages/packages/`:
```
installments-page.tsx
instances-page.tsx
memberships-page.tsx
```

The file IS `instances-page.tsx` — the filename is correct. However, the full path cited in the plan is correct.

Actually upon inspection, the path `apps/web/src/components/pages/packages/instances-page.tsx` is correct. No discrepancy.

---

### MEDIUM — Plan mentions `payments.service.ts` but it may not exist

**Location:** Plan section 5, Phase 3, item 4; Plan Open Question Q2

Plan states:
> verify existence of `packages/services/src/payments.service.ts`

Verification: `ls packages/services/src/` shows NO `payments.service.ts`. Payment history writes live in `refunds.service.ts` and `walk-in.service.ts`. There is no dedicated payments service.

The plan correctly flags this as Q2 open question. The recommendation to add `getPaymentStatusHistory` to `refunds.service.ts` or a new file is sound, but must be resolved before Phase 3 implementation begins.

**Action:** Plan should resolve Q2 explicitly. Recommended resolution: create `packages/services/src/payments.service.ts` as a new file with `getPaymentStatusHistory`.

---

### MEDIUM — Line number claim for `refunds.service.ts` unverifiable from plan context

**Location:** Plan section 5, Phase 3, item 2

Plan states:
> `packages/services/src/refunds.service.ts` — verify: the payment status history append at line 813

Verification: `grep -n "appendPaymentStatusHistory" packages/services/src/refunds.service.ts` returns line 813. Line number is correct.

---

### MEDIUM — Line number claim for `walk-in.service.ts` unverifiable from plan context

**Location:** Plan section 5, Phase 3, item 3

Plan states:
> verify: history append at line 143

Verification: `grep -n "appendPaymentStatusHistory" packages/services/src/walk-in.service.ts` returns line 143. Line number is correct.

---

### MEDIUM — Plan section 6 cites `installment.service.ts` approx line 421-424

**Location:** Plan section 6

Plan states:
> **File:** `packages/services/src/installment.service.ts` (approx. line 421–424)

Verification: `evaluateAndExpireIfOverdue` update block is at lines 421-424. Confirmed correct.

---

### LOW — Plan refers to `packages/services/src/installment.service.ts` as "called from `evaluateAndLockIfOverdue`"

Plan section 6 states:
> This function is called from `evaluateAndLockIfOverdue` and from the installment evaluation logic.

Verification: `evaluateAndLockIfOverdue` at line 435 calls `evaluateAndExpireIfOverdue` at line 440. Confirmed correct.

---

### INFO — Phase 2 dependency on Phase 1 correctly documented

Plan states Phase 2 prerequisite: "A reusable `StatusTimeline` component extracted from Phase 1's `StatusHistoryCard`." This dependency is correctly identified. Phase 2 cannot proceed until Phase 1's `StatusHistoryCard` is built and the component extracted.

---

### INFO — `appointment/view.tsx` path confirmed

Plan Phase 2, item 7 cites:
> `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`

Directory `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/` contains `view.tsx`. Correct.

---

### INFO — `payment/view.tsx` path confirmed

Plan Phase 3, item 6 cites:
> `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx`

Directory confirmed. File exists. Correct.

---

### INFO — Sales `$id.tsx` path confirmed

Plan Phase 1, item 4 cites:
> `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx`

Directory `apps/web/src/routes/_authenticated/dashboard/_layout/sales/` contains `$id.tsx`. Correct.

---

## Verdict

Two issues require resolution before implementation:
1. Q2 (payments.service.ts existence) must be resolved — add to Phase 3 decision.
2. Permission resource names are wrong (covered by api-surface-auditor).
