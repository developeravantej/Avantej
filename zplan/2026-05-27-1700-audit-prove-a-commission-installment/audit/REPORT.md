# Audit Report — commission + installment domains
Session: `zplan/2026-05-27-1700-audit-prove-a-commission-installment`
Branch: `audit-prove-a/commission-installment-20260527-1700`
Date: 2026-05-27

## Method
4 parallel read-only general-purpose agents, one per domain:
- D-commission-engine (rule engine, splits, math, cycle policy)
- D-commission-payouts (router + service + 5 UI tabs)
- D-installments-pos (POS first-installment, sweep cron)
- D-installments-saas (subscription billing + Stripe reconciliation)

Verified first-hand: F-COM-A, F-COM-B, F-PAY-1.

## Findings summary
| Domain | Critical | High | Medium | Total | Testable (browser) |
|---|---|---|---|---|---|
| D-commission-engine | 2 | 1 | 1 | 4 | 4 |
| D-commission-payouts | 2 | 2 | 1 | 5 | 5 |
| D-installments-pos | 1 | 3 | 0 | 4 | 3 |
| D-installments-saas | 2 | 1 | 0 | 3 | 0 |
| **Total** | **7** | **7** | **2** | **16** | **12** |

## Worklist (priority order)
| # | ID | Severity | Status | Testable | Title |
|---|---|---|---|---|---|
| 1 | F-COM-A | critical | partial | ✅ | getMyCommissions queries member.id not userId — My Commissions empty for every trainer |
| 2 | F-COM-B | critical | partial | ✅ | Automatic splits omit configVersionId → per-cycle cap silently exceeded |
| 3 | F-PAY-3 | critical | partial | ✅ | Two divergent mark-paid pipelines; Liability writes no payouts row → KPIs under-report |
| 4 | F-PAY-6 | critical | partial | ✅ | Payouts tab exposes zero action UI for full state machine; reversal payouts stuck pending |
| 5 | F-SAAS-1 | critical | partial | ⚠ control-panel | Stripe lifecycle never writes organizations.paymentStatus → middleware lockout unreachable |
| 6 | F-SAAS-2 | critical | missing | ⚠ control-panel | No past-due → suspended sweeper cron; grace window never enforced |
| 7 | F-INS-3 | critical | partial | ⚠ race-cond | Cron-vs-payment race; row locks taken in different orders |
| 8 | F-COM-C | high | partial | ✅ | reverseForRefund full clawback for any salesOrder split — partial refund nukes whole order's commission |
| 9 | F-PAY-1 | high | partial | ✅ | Liability-tab markPaidBatch doesn't invalidate payouts list cache |
| 10 | F-PAY-4 | high | partial | ✅ | Math.abs on reversal rows inflates Disbursed-this-Month KPI |
| 11 | F-INS-1 | high | partial | ✅ | Schedule rounding remainder on installment #1, tax remainder on last — inconsistent |
| 12 | F-INS-2 | high | partial | ✅ | POS first-installment skips confirmInstallmentPayment → no audit_log + misses completion flip |
| 13 | F-INS-4 | high | partial | ✅ | 7 installment mutations gated by role==='admin' instead of permission system |
| 14 | F-SAAS-3 | high | partial | ⚠ control-panel | markActive/markPastDue have no event-timestamp ordering guard; redelivery can clobber state |
| 15 | F-COM-D | medium | partial | ✅ | categoryCommission upsert/delete write no audit_log entries |
| 16 | F-PAY-10 | medium | partial | ✅ | useRunBatch drops confirmImmediately:false; bank-transfer always lands paid |

## Per-domain reports
- [D-commission-engine.md](D-commission-engine.md)
- [D-commission-payouts.md](D-commission-payouts.md)
- [D-installments-pos.md](D-installments-pos.md)
- [D-installments-saas.md](D-installments-saas.md)

## Next step
Phase 2 (test plan), then Phase 3 (gap-prove harness), then Phase 4 (human-gated remediation loop — first approval prompt at iteration 1).
