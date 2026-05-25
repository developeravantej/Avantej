# Plan — POS collects only the FIRST installment

**Date:** 2026-05-25
**Goal:** When a package is sold on a multi-installment plan at POS, the counter shows and collects **only installment #1** ("Due now"); the order value stays full; installments #2..N stay scheduled. Today POS records the **full** price (payment + invoice paid-in-full) and only layers a schedule on top — contradicting the installments table.

## Current behavior (verified)
- Totals come only from cart items+discount+tax; the plan is a label (`pos-workflow.tsx:431,604`).
- `cashOk` requires `tendered >= full total` (`:446-449`).
- `recordPosSale` records `payment.amount/totalAmount = full` (`pos.service.ts:458-461`) and `invoice.amountPaid = full`, `status="paid"` (`:566-567`), then auto-confirms installment #1 (`:639-688`).
- Net: money side = paid-in-full; installments side = 1/N paid. Inconsistent.

## Target "due now" (single-package cart)
`dueNow = firstInstallmentPrice + firstInstallmentTax` where, matching `createInstallmentSchedule`/`calculateInstallmentAmounts`:
- `firstInstallmentPrice = calculateInstallmentAmounts(taxBase, N)[0]` (first absorbs the price rounding remainder; `taxBase = subtotal − discount`)
- `firstInstallmentTax = floor(taxCents / N)` (last installment absorbs the tax remainder — so #1 uses the floor)
- For `N === 1` (Pay in full): `dueNow = full total` (unchanged behavior).

## Mixed carts — DECIDED: split
A plan still applies to exactly one package item (backend enforces `packageItems.length === 1`). Non-package items (custom/products) are billed **in full now**; only the package defers.
- `dueNow = (non-package items, full incl. their tax share) + (package first installment incl. its tax share)`
- Equivalent: `dueNow = fullOrderTotal − packageDeferred`, where `packageDeferred = packageFull − packageFirstInstallment` (installments #2..N incl. tax).
- The `payment` row collected now is therefore **mixed** (non-package full + package #1); only the package's #2..N are receivables.

> **Backend subtlety to fix (tax apportionment):** `recordPosSale` step 13 computes the package's schedule tax as `floor(taxCents × itemTotal / totalPackagePrice)`, where `totalPackagePrice` is the **package items only**. With a single package this assigns the **entire order's tax** (incl. tax on non-package items) to the package schedule — wrong for a split cart. The split fix must apportion tax on the **whole order base** so the package's schedule only carries its own tax share, and the non-package tax is collected now.

## User journeys
1. **Golden — single package on `quarterly`:** Confirm shows `Package RM1200` + `Due now (1/4) RM300`; cash gate wants RM300; submit → invoice `amountPaid=300`, `status=partial`; installment #1 paid, #2–4 pending; credits 3/12; receipt.
2. **Pay in full (N=1):** due now = full; unchanged.
3. **Split — package on plan + a custom item:** custom item billed full now; package contributes only #1 → `dueNow = custom_full + package_#1`; only the package's #2..N scheduled.
4. **Card / manual_transfer installment:** records installment #1 as the payment; reference optional.

## Changes

### Backend (`packages/services/src/pos.service.ts`, `packages/api/src/routers/pos.ts`)
- When `installmentPlan && numInstallments > 1`:
  - Compute `firstInstallment{Price,Tax}` once (reuse `calculateInstallmentAmounts`).
  - `payment.amount = firstInstallmentPrice`, `payment.taxAmount = firstInstallmentTax`, `payment.totalAmount = firstInstallment(Price+Tax)`.
  - `invoice.totalAmount = full` (owed), `invoice.amountPaid = firstInstallment total`, `invoice.status = "partially_paid"` (NOT `"partial"` — see review; that string renders as an unknown grey badge).
  - Keep the schedule + auto-confirm #1 as-is; ensure NO double-count (the payment row now represents the #1 collection).
  - Keep `package_instance.totalPrice/taxAmount = full`; `paymentStatus = partially_paid` (via existing `syncPackagePaymentStatus`); set `outstandingAmount` if that column exists (reconcile with 05-17).
- `changeDueCents` (cash) computed against `dueNow`, not full.
- Server is authoritative for `dueNow` — do NOT trust a client-sent amount.

### Frontend (`pos-workflow.tsx`, `payment-step.tsx`, `cart-summary.tsx`)
- Add `lib/installments.ts` helper `firstInstallmentCents(taxBaseCents, taxCents, numInstallments)` mirroring backend math.
- `pos-workflow.tsx`: derive `dueNowCents` from `selectedPlan?.numInstallments` + totals. Use `dueNowCents` for `cashOk`, change-due, the Confirm "Due now" line, and the right-panel; keep "Package total" shown for context.
- `payment-step.tsx`: cash auto-tender = `dueNow`; "less than total" → "less than amount due"; gate vs `dueNow`. (Tendered-touched sync fix from prior pass stays.)
- Disable the installment plan picker unless the cart is a single package item (v1 restriction).

## Risks
- **Double-counting** money (payment full + installment #1 paid) — the core thing to get right.
- **Downstream reads** of `invoice.amountPaid`/`payment.amount` as "full sale" — Sales & Payments list, reports. `invoice.totalAmount` stays full (order value intact); verify the list shows order value, not amountPaid, for the sale total.
- **Reconcile** with `syncPackagePaymentStatus` / `outstandingAmount` from the 05-17 sessions — don't double-write or conflict.
- **Tax rounding** parity between UI `dueNow` and backend schedule (use the same floor math).
- **Tax apportionment (split carts)** — see the subtlety above; the package schedule must not absorb non-package tax. This is a pre-existing latent issue the split path forces us to fix.
- **Plan-picker visibility** — currently shows when any package/service item exists (`payment-step.tsx:121`); ensure it still requires exactly one package and that non-package items don't break `dueNow`.
- Stripe/online installment path (parks pending) — keep its existing pending semantics; due-now still = #1.

## Verification
- Extend the POS QA spec: golden with `quarterly` → assert Confirm "Due now" = first installment, cash gate = first installment, submit 200, then assert (via API or receipt) `invoice.amountPaid = #1`, `status=partial`, installments #1 paid / #2–4 pending, credits = N1 share.
- `bun check-types --filter web` + `tsc` on `packages/services` (gate blind spot).
- Manually check Sales & Payments list still shows the full order value for the sale.

## Phasing
- **P1 (backend):** journey 1's money model in `recordPosSale` + reconcile paymentStatus/outstanding. Verify via API.
- **P2 (frontend):** due-now display + cash gate + plan-picker restriction. Verify in browser.
- **P3 (verify):** QA spec journey + downstream-reads check.

## Recommendation
Have this reviewed as a "staff engineer" pass before implementing (per house rule), since it changes the money model and intersects the in-flight 05-17 installment work.

---

## Review outcome (2026-05-25) — REWORK (see `review.md`)
Concept is right; four must-fixes before coding:

1. **Invoice status string** — use `"partially_paid"`, not `"partial"` (`invoices.ts:20-21`; badge map `sales/$id.tsx:55`). Text column → no migration. ✅ corrected above.
2. **Promo + installment is a real backend bug to settle FIRST** — `recordPosSale` splits the **gross** package total for principal (`pos.service.ts:600,653`) but the **discounted** base for tax (`:601-604`), so a discounted package's installments don't sum to the discounted price. The UI `dueNow` can't faithfully mirror an internally-inconsistent backend. Fix the backend split to be self-consistent, then mirror in the UI. (Until then, dueNow ≠ actual collection → wrong cash gate.)
3. **Stripe/"online" path** — auto-confirm of installment #1 is unconditional (`pos.service.ts:645-693`, no payment-status guard). Under the new model it would write a #1 `amountPaid` for money not collected, and the webhook has no #1-confirm logic. **Skip auto-confirm + first-installment collection for stripe**; the order stays fully pending until the webhook.
4. **Receipt mapping breaks** — `mapReceiptResponse` (`sales/$id.tsx:668-669`) derives receipt total/tax from `payment.totalAmount/taxAmount`; with a partial payment it would show full subtotal but partial total. Update the receipt to source the order/invoice total for the "owed" figure and label the payment as the first installment.

**Sequencing / dependency:** 05-17 Task 1.4 (`syncPackagePaymentStatus` in POS) + the `outstandingAmount` column are a **prerequisite** — sequence that first, don't reimplement in parallel.

**Revised phasing:** P0 settle the promo/tax split inconsistency (backend) + land 05-17 Task 1.4/outstandingAmount → P1 backend partial-collection (with stripe guard + correct enum) → P2 frontend dueNow/cash-gate/receipt → P3 verify.

---

## Progress
- **P0 — DONE (2026-05-25), type-check clean.** `pos.service.ts`:
  - Package installment principal now net of promo (`itemNet = gross − floor(discount × gross/subtotal)`); package taxed on its own net at the order rate (no longer dumps non-package tax on the package; removed `totalPackagePrice`).
  - `packageInstance.totalPrice` + schedule `totalPrice` use `itemNet`.
  - Added `syncPackagePaymentStatus(tx, pkgInstance.id)` after auto-confirm (05-17 Task 1.4 prereq).
  - Decision: `outstandingAmount` column NOT added (avoids a tenant migration) — outstanding is derivable from pending installments; revisit if 05-17 lands the column.
  - Not yet behaviorally verified (needs a package + installment-plan sale) — deferred to P3.
- **P1 — TODO:** partial collection — `payment.amount/totalAmount` = first installment; `invoice.amountPaid` = first installment, `status = "partially_paid"`; **skip first-installment collection for `stripe`** (stays fully pending until webhook); avoid double-count.
- **P2 — TODO:** frontend `dueNow` (mirror `itemNet` + per-installment math), cash gate vs `dueNow`, "Due now" display, receipt mapping (`sales/$id.tsx:668`).
- **P3 — TODO:** verify (QA spec journey: quarterly sale → due-now, invoice partial, schedule, credits) + downstream-reads check.
