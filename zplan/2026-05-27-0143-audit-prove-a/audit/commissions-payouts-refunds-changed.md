# Audit: commissions-payouts-refunds-changed
**Files inspected:** 7 routers (commission-splits/, payouts.ts, refunds/, expenses.ts, cancelled-sales.ts, category-commission.ts, package-instances/pending.procedures.ts), 7 services (commission-calculator, commission-splits, payouts, refunds, cancelled-sales, package-instance, expenses), 1 frontend (payouts-tab.tsx)
**Findings:** P1: 5, P2: 5, P3: 2, Total: 12

## Findings

### CPR-01 — Commission reversal "clawback" payout has WRONG SIGN (creates positive adjustment instead of negative)
- **Severity:** P1
- **Status:** implemented
- **Testable:** true
- **File:** `packages/services/src/payouts.service.ts:73-94`
- **Symptom:** When a refund triggers commission reversal, the resulting "clawback" payout adjustment row is inserted with a **positive** amount equal to the reversed cents, not a negative one. If that adjustment row is ever paid out (it is `status='pending'`, recipient is the trainer, and visible in the per-recipient ledger with a "Process Pending" button), the trainer is paid the clawback amount in addition to the original commission — a direct theft vector.
- **Evidence:**
  ```ts
  // reverseForRefund (commission-splits.service.ts:1922):
  reversalCents = -Math.min(unreversed, ...); // → negative, e.g. -5000

  // processCommissionReversals (payouts.service.ts:73-85):
  const totalNegativeAmountCents = -reversals.reduce(
      (sum, r) => sum + r.amountCents, 0,  // sum = -5000
  );                                        // totalNegativeAmountCents = -(-5000) = +5000
  await tx.insert(payouts).values({
      recipientId: staffId,
      amount: totalNegativeAmountCents,     // POSITIVE 5000 inserted!
      grossAmountCents: totalNegativeAmountCents,
      // ...
      payoutMethod: "adjustment",
      status: "pending",
      description: `Commission reversal adjustment for ${reversals.length} refund(s)`,
  })
  ```
- **Why it's wrong:** `commission_split_reversals.amountCents` is already stored as a negative value (per `reverseForRefund` semantics). Negating the sum of negative values yields a positive value. The variable name and the inline comment (`negative value = clawback`) document the intent — but the math is inverted. The frontend `payouts-tab.tsx:105` checks `row.amount < 0` to render a "Reversal" badge — these rows render as normal positive payouts and remain payable.
- **Suggested fix (do NOT apply):** Drop the leading `-` on line 73: `const totalNegativeAmountCents = reversals.reduce((sum, r) => sum + r.amountCents, 0);` — so the already-negative reversal cents flow through unchanged into the payout row.
- **Owned files:** `packages/services/src/payouts.service.ts`

### CPR-02 — Partial commission reversal flips the entire approved split to `status='reversed'`, dropping the unreversed remainder from payouts
- **Severity:** P1
- **Status:** implemented (incorrectly)
- **Testable:** true
- **File:** `packages/services/src/payouts.service.ts:105-109`
- **Symptom:** When a *partial* refund occurs (e.g. 30% of a package), `reverseForRefund` correctly creates a reversal row for only the partial amount. But the very next `processCommissionReversals` call (triggered by every `runBatch` per `payouts.ts:189-192`) marks the entire originating `commission_splits` row as `status='reversed'`. Subsequent runBatch queries filter on `status='approved'` (`payouts.service.ts:319`), so the 70% the trainer legitimately earned is silently dropped from every future payout.
- **Evidence:**
  ```ts
  // 5. Mark the originating commission splits as 'reversed'
  await tx
      .update(commissionSplits)
      .set({ status: "reversed" })
      .where(inArray(commissionSplits.id, splitIds));
  ```
- **Why it's wrong:** A reversal-of-some is not a reversal-of-all. The function does not consult `commissionSplits.calculatedAmount` vs `SUM(commissionSplitReversals.amountCents)` before flipping status. The bug stacks with CPR-01 — the trainer loses 70% of legitimately earned commission AND the (mis-signed) reversal row could be paid out.
- **Suggested fix (do NOT apply):** Only set `status='reversed'` when `abs(SUM(reversals.amountCents)) >= split.calculatedAmount`. For partial reversals, leave the split as `approved` and rely on the negative payout-adjustment row to represent the clawback net effect.
- **Owned files:** `packages/services/src/payouts.service.ts`

### CPR-03 — `approveExpense` does not block self-approval
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/services/src/expenses.service.ts:106-131`, `packages/api/src/routers/expenses.ts:114-140`
- **Symptom:** A user with `expense_management:update` who is also `submittedBy` of a pending expense can call `approve` on their own row. No check compares `existing.submittedBy` against `approvedBy`. Combined with `markExpensePaid` (same permission) the same user can self-submit, self-approve, and self-pay an arbitrary amount.
- **Evidence:**
  ```ts
  export async function approveExpense(tenantDb, id, approvedBy) {
      const existing = await getExpenseById(tenantDb, id);
      if (!existing || existing.status !== "pending") {
          throw new Error("Expense must be pending to approve");
      }
      // ← No check: existing.submittedBy === approvedBy
      const [row] = await tenantDb.update(expenses).set({
          status: "approved", approvedBy, approvedAt: new Date(), ...
      })...
  }
  ```
- **Why it's wrong:** Standard segregation-of-duties for finance flows: submitter ≠ approver. The router (`expenses.ts:114-140`) also has no guard.
- **Suggested fix (do NOT apply):** In `approveExpense`, throw BAD_REQUEST when `existing.submittedBy === approvedBy`. Same check in `markExpensePaid` if business policy treats it as a second approval step.
- **Owned files:** `packages/services/src/expenses.service.ts`, `packages/api/src/routers/expenses.ts`

### CPR-04 — Commission reversal is committed at refund APPROVE time, not PROCESS time
- **Severity:** P1
- **Status:** implemented (timing flaw)
- **Testable:** true
- **File:** `packages/services/src/refunds.service.ts:642-668`
- **Symptom:** `approveRefund` calls `reverseForRefund(tx, id, ...)` inside the approve transaction, *before* the refund is actually processed (cash dispensed / card reversed). A refund approval that is later left in `approved` state (operator never returns to click "Process") still clawed back commission. There is no inverse operation — the reversal rows persist and `commissionSplits` rows are marked `reversed` on the next runBatch — even though the customer has not been refunded any money.
- **Evidence:**
  ```ts
  // approveRefund — line 642-648 (refunds.service.ts):
  const reversalResult = await reverseForRefund(tx, id, {
      reason: `Refund ${existing.refundNumber} approved: ${existing.reason}`,
      initiatedBy: params.actor.userId,
      actor: params.actor,
  });
  ```
- **Why it's wrong:** The reversal should be tied to the side-effecting `processRefund` step. `approveRefund` is reversible in business terms (operator may abandon the refund). The state machine has no `unapprove` or `cancel` transition to undo the reversal once written, and `commission_split_reversals` has no soft-delete path.
- **Suggested fix (do NOT apply):** Move the `reverseForRefund` call from `approveRefund` to `processRefund` (line 760+ in refunds.service.ts), wrapped in the existing process transaction. Or add a "cancel approved refund" procedure that deletes the reversal rows.
- **Owned files:** `packages/services/src/refunds.service.ts`

### CPR-05 — Full-target package-instance refund does NOT cancel the package or freeze credits
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/services/src/refunds.service.ts:930-961`
- **Symptom:** When a refund is processed against `packageInstanceId` (full target, not partial), the package's `paymentStatus` flips to `"refunded"` only when cumulative `processed` refunds reach `totalPrice`. **`status` is never set to `cancelled`** and **`creditsUsed` / `creditsUnlocked` are never adjusted**. The customer can continue consuming credits on a fully-refunded package and earn the trainer fresh commission rows on each check-in.
- **Evidence:**
  ```ts
  // processRefund — line 954-959:
  if (cumulativeProcessedCents >= totalPrice && totalPrice > 0) {
      await tx
          .update(packageInstances)
          .set({ paymentStatus: "refunded", updatedAt: now })
          .where(eq(packageInstances.id, existing.packageInstanceId));
  }
  // ← No `status: "cancelled"`, no `creditsUsed = creditsTotal` lock-out
  ```
  Contrast with the `salesOrderId` path (lines 853-887) which DOES cancel linked package instances.
- **Why it's wrong:** Asymmetric refund effects: the sales-order path defends against credit consumption post-refund, the package-instance path does not. `createPartialRefund` correctly bumps `creditsUsed`; the full refund processing should at minimum do the same or set status=`cancelled`.
- **Suggested fix (do NOT apply):** When `cumulativeProcessedCents >= totalPrice`, also set `status='cancelled'` and `creditsUsed = creditsTotal` (or `creditsUnlocked`) so check-ins refuse.
- **Owned files:** `packages/services/src/refunds.service.ts`

### CPR-06 — `voidCommissionSplitsForSalesOrder` writes outside a transaction; partial failure leaves orphan audit rows
- **Severity:** P2
- **Status:** implemented (non-atomic)
- **Testable:** true
- **File:** `packages/services/src/commission-splits.service.ts:832-901`
- **Symptom:** Used by the cancelled-sales flow. The voiding UPDATE and the per-row `writeAudit` calls all run on `tenantDb` directly with no surrounding `transaction()`. A failure midway through the audit loop leaves splits voided but only a subset of audit rows written. Worse, the per-row appointment status lookups (lines 857-863) happen without a snapshot — concurrent appointment status changes can flip the skip decision between read and write.
- **Evidence:**
  ```ts
  // Line 881-885 — UPDATE outside any tx
  const updated = await tenantDb
      .update(commissionSplits)
      .set({ status: "void", notes: reason, updatedAt: new Date() })
      .where(inArray(commissionSplits.id, ids))
      .returning();

  for (const row of updated) {  // ← if any writeAudit throws, partial audit state
      await writeAudit(tenantDb, { ... });
  }
  ```
  Compare to `approveCommissionSplits` (line 650) and `voidCommissionSplit` (line 790) which both use `tenantDb.transaction(async (tx) => ...)`.
- **Why it's wrong:** Loss of the standard `audit row count == business row count` invariant the rest of the service maintains, and exposes a TOCTOU window on the appointment-status check.
- **Suggested fix (do NOT apply):** Wrap the whole function body in `tenantDb.transaction(async (tx) => ...)`, do appointment-status lookups inside the tx (ideally with `FOR UPDATE` or at least `SELECT ... FOR SHARE`), and write audit rows on the same `tx`.
- **Owned files:** `packages/services/src/commission-splits.service.ts`

### CPR-07 — `runBatch` payout: no per-batch reference uniqueness enforced; reference is stored only in `notes`/`description`
- **Severity:** P2
- **Status:** partial
- **Testable:** true
- **File:** `packages/services/src/payouts.service.ts:347-413`, schema: `packages/db/src/schema/tenant/payouts.ts` (referenced)
- **Symptom:** The runBatch transaction inserts one payout row per staff with `description: reference ?? null`. There is no unique constraint on `(recipientId, periodStart, periodEnd)` or on a `batchReference` column; the 23505 catch (lines 423-429) protects against an unspecified PK-level violation that may never fire. A second runBatch invocation with the same `reference` for an overlapping period and a freshly-approved split will create a *new* payout row. Splits are protected (FOR UPDATE + status flip), but operators clicking "Run Batch" twice rapidly can create two payout rows with identical `reference` strings.
- **Evidence:**
  ```ts
  const [newPayout] = await tx.insert(payouts).values({
      recipientId: staffId,
      amount: group.totalCents,
      // ...
      description: reference ?? null,
      notes: reference ? `Batch payout ref: ${reference}` : ...,
  }).returning({ id: payouts.id });
  // ← No SELECT/INSERT-on-conflict on a (recipient, period) key
  ```
- **Why it's wrong:** The split-level lock prevents *double-paying the same approved split*, but does not prevent two batch rows with the same reference for different splits in the same period — confuses reconciliation.
- **Suggested fix (do NOT apply):** Add a partial unique index on `payouts(recipientId, batchReference)` where `batchReference IS NOT NULL`, populate a dedicated `batchReference` column instead of overloading `description`, and surface CONFLICT in the UI.
- **Owned files:** `packages/services/src/payouts.service.ts`, `packages/db/src/schema/tenant/payouts.ts`

### CPR-08 — Per-cycle commission cap counts the trainer's *all-source* splits across every category
- **Severity:** P2
- **Status:** implemented (overbroad)
- **Testable:** true
- **File:** `packages/services/src/commission-splits.service.ts:392-408`
- **Symptom:** `applyCommissionCaps` resolves `config.maxPerCycleCents` from the split's *own* categoryId, but the aggregate it compares against is `SUM(calculatedAmount) WHERE staffId = X AND status != 'void' AND earnedAt IN [month]` — across **all categories**. A trainer who is near the cap on category A will have category B commission skipped or capped using A's threshold value.
- **Evidence:**
  ```ts
  const [agg] = await tdb
      .select({ total: sql`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)`... })
      .from(commissionSplits)
      .where(and(
          eq(commissionSplits.staffId, params.staffId),
          ne(commissionSplits.status, "void"),
          gte(commissionSplits.earnedAt, start),
          sql`${commissionSplits.earnedAt} < ${end}`,
      ));
  // ← No filter on categoryId / config — sums every commission the trainer earned this month
  ```
- **Why it's wrong:** Either the cap is per-category (then the SUM must be filtered to the same categoryId) or it is per-trainer (then `config.maxPerCycleCents` is a misnomer and should live somewhere global). The current code mixes the two semantics.
- **Suggested fix (do NOT apply):** Add a JOIN/EXISTS clause to restrict the SUM to splits whose effective category matches `params` (via `resolveCategoryIdForSplit`'s inverse). Or document this as a global per-trainer cap and move the column off the per-category config table.
- **Owned files:** `packages/services/src/commission-splits.service.ts`

### CPR-09 — `requestRefund` accepts `customerId` from input without verifying it matches the target
- **Severity:** P2
- **Status:** implemented (trust issue)
- **Testable:** true
- **File:** `packages/services/src/refunds.service.ts:361-408`
- **Symptom:** When the caller passes both a `salesOrderId` AND a `customerId`/`customerName`, the service uses the caller-supplied values verbatim (`customerId ?? order.customerId`). A trainer with `refund_management:create` could spoof the customer fields on the refund record (used downstream in audit/reports, displayed in `listRefunds`) while still targeting another customer's sales order.
- **Evidence:**
  ```ts
  customerId = customerId ?? order.customerId ?? "";
  customerName = customerName ?? order.customerName;
  // ← input-provided customerId wins; no assertion against order.customerId
  ```
- **Why it's wrong:** Customer identity should be **derived**, not accepted from input, when a target with a known customer is supplied. The branchId field is more carefully handled (line 420 rejects when missing), but customerId/Name are blindly trusted.
- **Suggested fix (do NOT apply):** If `input.salesOrderId` is set, require `input.customerId === order.customerId` (or omit the input field entirely and always pull from target). Same logic for `paymentId` / `packageInstanceId`.
- **Owned files:** `packages/services/src/refunds.service.ts`

### CPR-10 — Frontend "Process Pending" button always sends `paymentMethod: "bank_transfer"`, silently overriding operator intent
- **Severity:** P2
- **Status:** implemented (UX/correctness)
- **Testable:** true
- **File:** `apps/web/src/components/pages/commissions/payouts-tab.tsx:283-291`
- **Symptom:** The recipient-level "Process Pending" CTA invokes `processForRecipient.mutate({ ..., paymentMethod: "bank_transfer" })` with no UI choice. If the operator pays in cash or check, the audit row and `payouts.payoutMethod` column will say `bank_transfer` — defeating reconciliation. Also paints clawback "adjustment"-methods payouts (CPR-01) over with bank_transfer if the operator clicks the button while a positive-clawback row is pending.
- **Evidence:**
  ```tsx
  onClick={() =>
      processForRecipient.mutate({
          organizationId,
          recipientId: selectedRecipient.id,
          paymentMethod: "bank_transfer",   // ← hard-coded
      })
  }
  ```
- **Why it's wrong:** The `RunBatchDrawer` exposes a payment-method picker; the per-recipient path does not, creating a silent inconsistency in audit data.
- **Suggested fix (do NOT apply):** Open a small dialog/popover from the button to capture `paymentMethod` and optional `reference` before mutating, mirroring the batch drawer.
- **Owned files:** `apps/web/src/components/pages/commissions/payouts-tab.tsx`

### CPR-11 — Frontend payouts table masks mutation errors (no error UI on `useProcessForRecipient`)
- **Severity:** P3
- **Status:** missing
- **Testable:** true
- **File:** `apps/web/src/components/pages/commissions/payouts-tab.tsx:193, 280-303`
- **Symptom:** `useProcessForRecipient` is called and the button uses `processForRecipient.isPending` to drive its spinner — but `processForRecipient.error` / `isError` are never read or rendered. A backend `EMPTY_BATCH`, `CONFLICT`, or `FORBIDDEN` ORPCError surfaces as a silently-ignored failure; the user sees the spinner stop and assumes success.
- **Evidence:**
  ```tsx
  const processForRecipient = useProcessForRecipient(organizationId);
  // ...
  disabled={processForRecipient.isPending || pendingForRecipient === 0}
  // ← no usage of processForRecipient.error or .isError anywhere in this file
  ```
- **Why it's wrong:** Combined with CPR-10's hard-coded method, operators can issue requests that fail with no visible feedback. Without checking the data refetch, they have no way to know the payout didn't actually run.
- **Suggested fix (do NOT apply):** Wire `useApiMutation` (see CLAUDE.md) for automatic toast feedback, OR render an inline error block when `processForRecipient.isError`.
- **Owned files:** `apps/web/src/components/pages/commissions/payouts-tab.tsx`, `apps/web/src/features/payouts/api.ts` (likely)

### CPR-12 — `listPending` (NEW) accepts `branchId` but does not call `guardBranchAccessible`
- **Severity:** P3
- **Status:** implemented (RBAC gap, partial mitigation)
- **Testable:** true
- **File:** `packages/api/src/routers/package-instances/pending.procedures.ts:23-59`
- **Symptom:** The handler accepts `input.branchId` and uses it as the sole branch filter (line 50: `if (input.branchId) return [input.branchId];`). It does NOT call `guardBranchAccessible(input.branchId, context.accessibleNodeIds)` like sibling routers (e.g. `payouts.previewBatch` at `payouts.ts:150-152`, `expenses.list` at `expenses.ts:33-35`). A non-admin trainer can pass `branchId` of a sibling branch (outside their accessibleNodeIds) and the SQL filter will happily honor it.
- **Evidence:**
  ```ts
  const branchFilterIds: string[] | null = (() => {
      if (input.branchId) return [input.branchId];  // ← input trusted, no scope check
      if (scope === "assignable_to_me") {
          return accessibleNodeIds.length > 0 ? accessibleNodeIds : [context.member.hierarchyScopeId];
      }
      return accessibleNodeIds.length > 0 ? accessibleNodeIds : null;
  })();
  ```
  Mitigation: `accessibleNodeIds` is *not* applied as a fallback when `input.branchId` is set, so the leak depends on the trainer guessing a valid sibling-branch UUID. Still a scope-bypass surface.
- **Why it's wrong:** Convention in this codebase is to always reflect `branchId` through `guardBranchAccessible` (see `guards.ts` and every other money-flow router). Without it, the RBAC depth check is bypassed for an authenticated user who can enumerate UUIDs.
- **Suggested fix (do NOT apply):** Add `if (input.branchId) guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? [])` right after `assertOrgContextMatch`.
- **Owned files:** `packages/api/src/routers/package-instances/pending.procedures.ts`

---

## Summary

The recently-redesigned money flow has two structural defects in commission-reversal that together form a high-severity theft vector: **CPR-01** (`processCommissionReversals` inverts the sign of the clawback payout, turning every reversal into a positive payable adjustment for the trainer) and **CPR-02** (any partial reversal flips the *entire* originating split to `status='reversed'`, dropping unreversed remainders from future payouts). Stacked, a partial refund both (a) clobbers the trainer's legitimate residual commission AND (b) creates a positive-amount "adjustment" row payable to that same trainer. Adjacent issues compound the risk: commission reversal fires at refund-*approve* time with no inverse op (**CPR-04**); processed package-instance refunds never cancel the package or freeze credits, so refunded customers can keep earning the trainer commission on consumption (**CPR-05**); and expenses have no SoD check, so a single user with `expense_management:update` can submit→approve→pay (**CPR-03**). The frontend redesign adds two UX/correctness issues — hard-coded `paymentMethod` for "Process Pending" (**CPR-10**) and silent error swallowing (**CPR-11**). The new `listPending` procedure is missing the `guardBranchAccessible` convention used elsewhere (**CPR-12**).

## Top P1 issue

**CPR-01 — `processCommissionReversals` creates positive-amount payout adjustments instead of negative clawbacks** at `packages/services/src/payouts.service.ts:73`. The double-negation (`-reversals.reduce((sum, r) => sum + r.amountCents, 0)` where `r.amountCents` is already negative) yields a positive `amount` on the payout row. Combined with CPR-02 (partial reversals flagging the whole split reversed) this turns every refund-driven reversal into both lost legitimate commission AND a payable positive adjustment to the trainer — a direct commission-theft path that traverses the redesigned payouts UI.
