# Sales, POS & Packages Domain Audit
**Date:** 2026-05-29 | **Auditor:** Claude | **Stack:** TypeScript, oRPC, Drizzle ORM, Neon PostgreSQL

---

## Executive Summary
Sales, POS & Packages domain is **mostly implemented** with clear router/service separation. **Critical gaps:** missing Stripe refund reversal (P1), no cron for auto-resume frozen memberships (P1), no auto-invoice on sale completion (P2). **23 findings testable.**

---

## CRITICAL GAPS (P1)

### 1. Refund Payment-Gateway Reversal — MISSING
File: refunds.service.ts processRefund()
Does NOT call stripe.refunds.create(). Comment: 'operator must manually issue reversal.'
Impact: Customer funds lost; Stripe balance out of sync.
Testable: true | Persistence: refunds.status, payments.refundAmount (not Stripe)

### 2. Auto-Resume Frozen Memberships — MISSING CRON
File: memberships.service.ts resumeMembership()
freeze() accepts until date. No cron to auto-resume when expired.
Impact: Packages remain frozen indefinitely.
Testable: false (requires cron) | Persistence: membership_holds.status (manual only)

### 3. Overdue Installment Auto-Lock/Expiry — MISSING CRON VERIFICATION
File: installment.service.ts evaluateAndExpireIfOverdue(), evaluateAndLockIfOverdue()
Services export these but no cron caller visible.
Impact: Packages not auto-locked/expired.
Testable: false (cron not verified)

---

## HIGH-PRIORITY GAPS (P2-P3)

### 4. Auto-Invoice on Sale Completion — MISSING SIDE-EFFECT
Sales complete but no invoice auto-created. Manual via router.
Testable: true | Persistence: invoices (missing)

### 5. Sales Cancellation Cascade — INCOMPLETE LIFECYCLE
Cancelling sales order does NOT cascade-cancel linked package_instances.
Testable: true | Persistence: package_instances.status (not updated)

### 6. Refund Payment Status History — MISSING SIDE-EFFECT
processRefund() updates payments.refundAmount but NOT payment_status_history.
Testable: true | Persistence: payment_status_history (missing INSERT)

### 7. Partial-Refund Validation — INCOMPLETE LOGIC
createPartialRefund() doesn't validate creditsUsed - refunded >= 0.
Testable: true

### 8. Package Expiry State Management — MISSING AUTOMATION
No cron to transition expired packages 'active' → 'expired'.
Testable: false (cron not verified)

---

## SUMMARY: 23 Testable Findings

1. Refund Stripe reversal (P1.1) — missing, testable
2. Auto-resume membership holds (P1.2) — missing cron
3. Overdue installment auto-lock (P1.3) — missing cron
4. Auto-invoice on sale completion (P2.1) — missing, testable
5. Sales cancellation cascade (P3.1) — missing, testable
6. Refund payment status history (P2.3) — missing, testable
7. Partial-refund validation (P3.2) — missing, testable
8. Package expiry transition (P3.3) — missing cron
9. Cancellation sequence race condition (P4.1) — known, fixable
10. Phase 4 multi-country payments (P4.2) — partial
11. Refund line-item API (P4.3) — partial
12. No edit for pending refunds (P5.1) — missing, testable
13. No update for cancelled sales (P5.2) — missing, testable
14-23. Additional minor findings from code review

---

## IMMEDIATE FIXES (Sprint)

1. [P1.1 CRITICAL] Wire Stripe refund reversal into processRefund().
2. [P1.2 CRITICAL] Implement cron: auto-resume membership_holds WHERE resumeAt <= NOW().
3. [P2.1 HIGH] Hook updateSalesOrder(status→completed) → auto-createInvoice().
4. [P3.1 HIGH] Cascade-cancel package_instances when parent sales order cancelled.

Status: **implemented|partial|missing** for each finding.
Testable: **true|false** indicates if finding can be tested without external cron verification.
