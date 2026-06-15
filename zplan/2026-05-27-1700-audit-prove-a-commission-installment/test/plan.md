# Gap-Prove Test Plan — commission + installment
Session: `2026-05-27-1700-audit-prove-a-commission-installment`
Target spec: `e2e/gap-prove.spec.ts` (single session, one `test()`, one `test.step()` per journey, all `expect.soft(...)`).

## Pre-conditions / dependencies (run first)
- **PRE-01 Auth setup** — relies on `e2e/auth.setup.ts` storing `e2e/.auth/tenant-admin.json` (already exists).
- **PRE-02 Seed business data** — `bun e2e:seed` if not already seeded. Required for: test org `996febce-aaad-4ded-8f47-02d2b566c8ee`, members (admin + trainer), at least one product with category, one walk-in customer.

## Golden paths (one per major commission/installment surface)
| ID | Surface | Steps | Persistence |
|---|---|---|---|
| GP-01 | `/dashboard/commissions` (Payouts tab) | Load page, expect status filter, at least 1 KPI card | none |
| GP-02 | `/dashboard/commissions` (Liability tab) | Load tab, expect trainer rows + Mark-Paid button | none |
| GP-03 | `/dashboard/commissions/my` | Trainer login (or admin posing) → expects own splits | `commission_splits.staffId = current userId` |
| GP-04 | `/dashboard/payment/view` (POS payment) | Load, expect installment-schedule preview | none |

## Finding journeys
Each maps to one finding; passing assertion = correct behaviour. For `missing` (none currently here), it would be an absence assertion.

| ID | Finding | Journey | Assertion | Persistence check |
|---|---|---|---|---|
| F-COM-A | getMyCommissions uses member.id not userId | Trainer admin logs in → visits `/dashboard/commissions/my` for an org where commission_splits exist for their userId → expects NON-EMPTY ledger row count | direct DB: `SELECT count(*) FROM commission_splits WHERE staffId = <userId>` > 0 AND ledger shows same count |
| F-COM-B | Automatic splits omit configVersionId → cap silently exceeded | Seed: enable a per-cycle cap of 10_000 cents for staffA + category. Trigger 3 commission events totalling > cap. Expect cap to fire on event #3. | direct DB: `SELECT calculatedAmount FROM commission_splits WHERE staffId=X AND categoryId=Y AND earnedAt IN cycle` → sum ≤ cap; ALSO assert `configVersionId IS NOT NULL` on every new row |
| F-COM-C | reverseForRefund full-clawback on partial salesOrder refund | Create salesOrder with 2 line items (different trainers). Partial refund line A only. Expect: only line-A trainer split reversed; line-B trainer split untouched | direct DB: `commission_split_reversals` count = 1; line-B `commission_splits.status != void` |
| F-COM-D | categoryCommission upsert writes no audit_log | Admin updates a category commission rate. | direct DB: `SELECT * FROM audit_log WHERE entityType='category_commission_config' AND entityId=<id>` row count = 1 |
| F-PAY-1 | Liability markPaidBatch doesn't invalidate payouts cache | Stay on Payouts tab. Open Liability tab in same session. Mark-Paid trainer. Return to Payouts tab WITHOUT manual refresh. Expect Payouts list to include the new row | UI: payouts list count increases by 1 within `expect.poll` 5s |
| F-PAY-3 | Mark-paid from Liability writes splits only, no payouts row | Same as F-PAY-1 setup. Mark-Paid via Liability tab. | direct DB: `SELECT * FROM payouts WHERE created_at > <T>` row matched to splits exists |
| F-PAY-4 | Math.abs on reversal rows inflates Disbursed KPI | Seed payouts with one negative-amount reversal. Compute expected disbursed = SUM(amount) (signed). | UI: "Disbursed this Month" KPI === expected (not Math.abs sum) |
| F-PAY-6 | Payouts tab missing action UI for state machine | On a payout row with status='pending', expect Mark-Paid / Mark-Failed / Cancel actions to exist in row menu | UI: row menu contains at least one transition action |
| F-PAY-10 | useRunBatch doesn't forward confirmImmediately:false | Run a payout batch with confirmImmediately=false in UI. Expect payouts to land status='processing'/'pending', NOT 'paid'. | direct DB: `SELECT status FROM payouts WHERE batchId=<bid>` ∋ {'processing','pending'} |
| F-INS-1 | Schedule rounding remainder on row #1 instead of last | Create sale with total = 1001 cents over 3 installments. Expect rows: 333, 333, 335 (last absorbs). | direct DB: `SELECT amount FROM payment_items WHERE saleId=<sid> ORDER BY installmentNumber` |
| F-INS-2 | POS first-installment skips audit + completion flip | Create POS sale where total === first installment amount. Expect: `installment.paid` audit row exists; package completion fires if applicable. | direct DB: `audit_log` row for action='installment.paid' AND saleId=<sid> |
| F-INS-4 | 7 installment mutations gated by role==='admin' | Non-admin member with the appropriate `installment_management:write` permission attempts each of the 7 admin-gated mutations. Expect: success (not FORBIDDEN). | UI/API: 7 successful 200 responses |
| F-PAY-9-bonus | Liability "Process Pending" per-recipient inflated by Math.abs | (covered by F-PAY-4 broader case) | — |

## Deferred to human (not browser-testable from tenant scope)
| ID | Reason | Recommended verification |
|---|---|---|
| F-SAAS-1 | control-panel write; no tenant-scoped UI | Backend integration test calling Stripe-webhook handler with mock event → assert organizations.paymentStatus updates |
| F-SAAS-2 | missing cron; no surface to click | Add cron + add integration test exercising past_due grace window |
| F-SAAS-3 | webhook ordering; needs simulated out-of-order event delivery | Backend integration test |
| F-INS-3 | concurrency race; no deterministic browser repro | Backend integration test with two concurrent transactions |

## Persistence verification mode
`db.verifyMode = "auto"` → resolves to **direct DB** because `apps/server/.dev.vars` carries `DATABASE_URL` + per-tenant Neon URL pattern. Use the helper `apps/server/src/tests/helpers/integration-setup.ts`'s `makeIntegrationAdminContext()` to open a tenant connection in `e2e/db-verify.ts`.

## Order
1. PRE-01, PRE-02 (auth + seed)
2. GP-01 → GP-04 (golden paths)
3. F-COM-A → F-COM-B → F-COM-C → F-COM-D
4. F-PAY-1 → F-PAY-3 → F-PAY-4 → F-PAY-6 → F-PAY-10
5. F-INS-1 → F-INS-2 → F-INS-4
6. (deferred: F-SAAS-1..3, F-INS-3)
