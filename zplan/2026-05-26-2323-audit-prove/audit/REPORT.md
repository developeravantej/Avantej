# Audit-Prove Report — 2026-05-26

**Session:** `zplan/2026-05-26-2323-audit-prove`
**Scope:** 6 domains · 25 findings (18 testable)
**Build gate:** ✅ GREEN (bun check-types — full turbo, 0 errors)
**Video:** pending Phase 5
**Remediation:** pending Phase 4 · **Branch:** `audit-prove/remediation-services-tabs-20260525-1529`

---

## 0. Remediation loop
*Pending — loop has not run yet.*

---

## 1. Build gate
`bun check-types` (cold): **GREEN** — 3 packages pass, full turbo.

---

## 2. Proof video
*Pending Phase 5.*

---

## 3. Findings (prioritized)
Per-domain detail: `audit/*.md` · machine-readable: `audit/findings.json`
Legend: ✅verified · 📋agent-reported · ⚠️corrected

### P1 — Critical

| ID | Title | File:line | Status | Testable | Verified |
|---|---|---|---|---|---|
| AC-01 | Households.list privilege escalation — empty accessibleNodeIds → unrestricted | households.ts:269 | partial | ✅ | ✅verified |
| SP-01 | POS accepts stripe/online without Stripe feature-flag on org | pos.ts:62 | missing | ✅ | ✅verified |
| AP-01 | Waitlist promotion race — spotsBooked incremented without capacity check | waitlist.service.ts:163 | partial | ✅ | ✅verified |
| AP-02 | listForUser does not expand virtual recurrences — clients see only parent | list.procedures.ts:199 | partial | ✅ | ✅verified |
| PS-01 | bulkApprove auto-confirms first installment with hardcoded paymentMethod | approve.procedures.ts:317 | partial | ✅ | ✅verified |
| PS-02 | setBranchPrice null branchId bypasses branch access guard | guards.ts:90 | missing | ✅ | ✅verified |
| OF-01 | Goods receipt creation does not advance PO status | goods-receipts.ts:56 | partial | ✅ | 📋agent-reported |
| OF-02 | Payout batch runBatch does not validate splits are approved | payouts.ts:171 | partial | ✅ | 📋agent-reported |
| ST-01 | Announcements scopes written but no notification dispatched | announcements.ts:88 | partial | ✅ | 📋agent-reported |
| SP-05 | Cancellation void does not create commission reversal audit rows | commission-splits.service.ts:832 | partial | ❌ | ⚠️corrected |

### P2 — High

| ID | Title | File:line | Status | Testable | Verified |
|---|---|---|---|---|---|
| AC-02 | walk-in-customers.list hardcoded empty (should throw like other deprecated endpoints) | walk-in-customers.ts:18 | partial | ✅ | ✅verified |
| SP-02 | Installment reschedule does not re-evaluate overdue lock | installments.ts:340 | partial | ✅ | 📋agent-reported |
| SP-03 | Promo code not re-validated at recordPosSale if deactivated after frontend validate | promotions.service.ts | partial | ✅ | 📋agent-reported |
| SP-04 | Tax rate silently defaults to 0 if no org default configured | pos.service.ts:378 | partial | ✅ | 📋agent-reported |
| AP-03 | Check-in does not validate appointmentClientId exists/belongs to client | check-ins.ts:32 | partial | ✅ | 📋agent-reported |
| AP-04 | Class slot capacity can be reduced below current spotsBooked | class-slots/crud.procedures.ts:45 | missing | ✅ | 📋agent-reported |
| AP-05 | Appointment reschedule does not check trainer availability exceptions | appointment.service.ts:489 | partial | ✅ | 📋agent-reported |
| PS-03 | createTrainerTier does not scaffold commission_tier_rates rows | trainer-tier.service.ts:48 | partial | ✅ | ✅verified |
| PS-04 | Freeze/resume managed by two independent code paths — race condition | memberships.ts | partial | ✅ | 📋agent-reported |
| OF-03 | Category commission slot weightages not validated to sum 10000 bps | category-commission.ts:29 | partial | ✅ | 📋agent-reported |
| OF-04 | Product price override accepts effectiveUntil < effectiveFrom | products.ts:246 | partial | ✅ | 📋agent-reported |
| AC-04 | updateRole does not write audit log | role.procedures.ts:100 | partial | ✅ | 📋agent-reported |
| ST-04 | Member hierarchy reassignment accepts out-of-scope target | hierarchy/members.procedures.ts:91 | partial | ✅ | 📋agent-reported |

### Untested (missing infrastructure — not remediable via browser loop)

| ID | Title | Reason |
|---|---|---|
| ST-02 | Notifications: no email/SMS/push dispatcher | Backend infra gap |
| ST-03 | Scheduled reports: no cron handler | Backend infra gap |
| SP-05 | Commission void reversal audit | No UI surface |
| AC-03 | GHL sync silent failure | External service |

---

## 4. Verification notes

**⚠️ Corrected findings:**
- OF agent reported "stock requests/transfers do not mutate stock levels" — **WRONG**. Both `fulfillStockRequest` (stock-requests.service.ts:179) and `completeTransfer` (transfer-orders.service.ts:180) call `adjustStock`. ✅
- OF agent reported "commission reversal missing in refund flow" — **PARTIALLY WRONG**. `reverseForRefund` IS called in refund approval (refunds.service.ts:644). The real gap is that cancellation voids don't create reversal audit rows.

**Security findings flagged:**
- AC-01 (households privilege escalation) — non-admin can read all org households
- PS-02 (setBranchPrice null bypass) — regional admin can set org-wide pricing

**Counts:**
- P1 testable: 8 · P1 non-testable: 2
- P2 testable: 10 · P2 non-testable: 0
- Infrastructure gaps (not loopable): 4
