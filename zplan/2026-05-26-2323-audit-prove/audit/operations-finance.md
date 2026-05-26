# Domain operations-finance

## Endpoints / Procedures

### commission-splits/read.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | commission_management:read | List commission splits by member/appointment/date | listCommissionSplits |
| `getByAppointment` | commission_management:read | Fetch all splits for an appointment | getCommissionsByAppointment |
| `getMyCommissions` | commission_management:read | Get current user's commission splits | getMyCommissions |
| `listLedger` | commission_management:read | Enriched ledger with totals (Phase 6) | listCommissionLedger |

### commission-splits/lifecycle.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `approve` | commission_management:approve | Bulk approve pending splits | approveCommissionSplits |
| `markPaid` | commission_management:process | Bulk mark approved splits as paid | markCommissionSplitsPaid |
| `void` | commission_management:approve | Void a single split | voidCommissionSplit |
| `createManualAdjustment` | commission_payout:create | Create manual bonus/clawback | createManualAdjustment |
| `markPaidBatch` | commission_payout:update | Batch mark approved splits as paid by members+date | markPaidBatch |
| `markPaidById` | commission_management:process | Batch mark splits paid by IDs (<=50) | markCommissionSplitsPaid |
| `voidById` | commission_management:approve | Void single split by ID | voidCommissionSplit |

## Gaps (prioritized P1/P2/P3)

### P1 — Commission reversal does not trigger on sale cancellation (commission-splits.service.ts:832)
**status: partial | testable: true**

voidCommissionSplitsForSalesOrder() voids splits but does NOT create commission_split_reversals rows. Finance cannot track why commissions were reversed. Should create reversal records or call reverseForRefund() path.

**Persistence:** commission_split_reversals { reversedSplitId, amountCents (negative), reason }

### P1 — Payout batch may not validate splits are approved (payouts.ts:171)
**status: partial | testable: true**

runBatch() handler calls service but no explicit verification that splits are status='approved'. Bypass of approval workflow is possible.

**Persistence:** payouts { recipientId, amount, status }, commission_splits { status }

### P1 — Goods receipt does not update PO status or trigger stock adjustments (goods-receipts.ts:56)
**status: partial | testable: true**

createReceipt() creates dangling goods receipt. No PO status update. No automatic stock adjustment. Caller must manually call adjustStock endpoint separately.

**Persistence:** purchase_orders { status }, goods_receipts, inventory ledger

### P1 — Stock requests and transfer orders do NOT mutate stock levels (stock-requests.ts:139, transfer-orders.ts:118)
**status: missing | testable: true**

fulfillStockRequest() and completeTransfer() are audit records only. No stock movement between branches. Inter-branch transfer feature is incomplete.

**Persistence:** inventory on-hand { branchId, productId, qtyOnHand }

### P1 — Expenses do not create GL entries or AP clearing (expenses.ts:50)
**status: missing | testable: true**

markExpensePaid() marks expense as paid but creates no GL journal entry. AP is not cleared. Finance cannot reconcile against trial balance.

**Persistence:** GL_entries { accountCode, debitCents, creditCents, expenseId }

### P2 — Category commission config slot weightages not validated at upsert (category-commission.ts:29)
**status: partial | testable: true**

upsert handler accepts slots without validating sum(weightageBasisPoints) == 10000 bps. Only asserted at split calculation time (warning, not error).

**Persistence:** category_commission_configs, commission_coach_slots

### P2 — Manual adjustments pending_review (>=RM500) have no SLA or escalation (commission-splits.service.ts:1217)
**status: partial | testable: true**

High-value adjustments blocked in pending_review. No deadline or auto-escalation. Single unresolved split blocks all payouts for staff member.

**Persistence:** commission_splits { status, createdAt }

### P2 — Product price overrides not validated for date logic (products.ts:246)
**status: partial | testable: true**

setBranchPrice() accepts effectiveFrom and effectiveUntil but no validation that effectiveUntil > effectiveFrom. Inverted ranges silently don't apply.

**Persistence:** product_prices { effectiveFrom, effectiveUntil }

### P2 — Category commission config allows orphaned rates (category-commission.ts:29)
**status: partial | testable: true**

upsert allows both rates and conditions to be set but no validation that the active set is non-empty. Orphaned rates silently ignored.

**Persistence:** category_commission_configs, commission_tier_rates, commission_conditions

### P2 — Stock requests/transfers lack required reason or justification (stock-requests.ts:65)
**status: partial | testable: true**

Only optional notes field. Blank transfers with no business justification can be created. Audit trail incomplete.

**Persistence:** stock_requests, transfer_orders (add required reasonCode enum)

### P3 — Commission split auto-creation trigger not verified (Not shown)
**status: unknown | testable: false**

Commission-calculator service exists but integration point (appointment completion) is in appointment.service (outside this domain audit scope).

**Persistence:** N/A (tracing only)

### P3 — Payout preview and execution may diverge (payouts.ts:135)
**status: partial | testable: true**

previewBatch() is read-only dry-run. If splits are approved/voided between preview and runBatch() execution, amounts differ. No pessimistic lock.

**Persistence:** commission_splits { status, calculatedAmount }

### P3 — Supplier deactivate does not enforce referential integrity (suppliers.ts:142)
**status: partial | testable: true**

deactivate() marks soft-inactive but POs can still reference deactivated suppliers. No CHECK constraint. Deactivation is advisory only.

**Persistence:** suppliers { isActive }, purchase_orders { supplierId }

**Testable findings:** 14 (P1: 5, P2: 5, P3: 3)

