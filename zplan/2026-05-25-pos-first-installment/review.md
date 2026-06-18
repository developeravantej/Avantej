# Staff-Engineer Review — "POS collects only the FIRST installment"

**Reviewer pass date:** 2026-05-25
**Plan reviewed:** `zplan/2026-05-25-pos-first-installment/plan.md`
**Scope:** money-model change in `recordPosSale` + POS frontend due-now display. Intersects in-flight `zplan/05-17_20-46_installment-system-completeness`.

---

## Verdict

**REWORK** (before any code).

The core idea is sound and the plan correctly anticipates the two highest-risk areas (double-count and downstream `amountPaid` reads). But it ships with a **wrong invoice status value** (`"partial"` does not exist anywhere — the canonical value is `"partially_paid"`), an **incorrect dueNow tax-base formula** that breaks the moment a promo is applied to a package, an **unaddressed Stripe/pending interaction** (auto-confirm #1 fires even when the sale is parked pending), and a **direct collision with 05-17 Task 1.4 + the `outstandingAmount` column** that the plan only hedges around. It also misses a concrete downstream break in the receipt mapper (`mapReceiptResponse`) that the plan never names. Fix these, re-confirm the math against the gross-vs-discounted principal split, then it's a go.

---

## Confirmed correct

1. **Current behavior is as described.** `recordPosSale` records the full sale on the money side and layers a schedule on top with installment #1 auto-confirmed.
   - `payment.amount = taxBase` (full), `taxAmount = taxCents` (full), `totalAmount = totalCents` (full) — `pos.service.ts:464-467`.
   - `invoice.totalAmount = totalCents`, `amountPaid = totalCents` (non-stripe), `status = "paid"` — `pos.service.ts:570-573`.
   - Auto-confirm of installment #1 — `pos.service.ts:665-693`.
   - So money side = paid-in-full while installments side = 1/N. The inconsistency the plan targets is real.

2. **`cashOk` gates against the full total.** `pos-workflow.tsx:446-449` (`amountTenderedCents >= totalCents`). Plan's claim verified.

3. **Backend is authoritative for amounts.** The router (`pos.ts:90-114`) recomputes everything server-side and ignores any client total; only `amountTenderedCents` comes from the client. The plan's "do NOT trust a client-sent amount" stance is already the architecture — good.

4. **`calculateInstallmentAmounts` puts the price remainder on #1; tax remainder on the LAST installment.** `installment.service.ts:78-89` (price: `i===0 ? base+remainder`) and `:237-249` (tax: `i===installmentsTotal ? base+remainder`). So the plan's "#1 uses the tax floor" is correct.

5. **`package_instances` has NO `outstandingAmount` column today.** Confirmed against `package-instances.ts:18-116`. The plan's conditional ("set it if that column exists") is honest — but see Reconciliation.

6. **Refund math reads paid installments, not `payment.amount`.** `getSuggestedRefund` (`installment.service.ts:1442-1459`) sums `installments.amount`/`taxAmount` WHERE `status='paid'`. So shrinking `payment.amount`/`invoice.amountPaid` does NOT corrupt suggested-refund math. (Plan pressure-test #6 answer: consistent.)

7. **Revenue analytics sum `sales_orders.totalAmount`, not `payments`.** `analytics.service.ts:418-435` (revenue series) and `:628` (LTV) both aggregate `salesOrders.totalAmount`, which stays full. So reported revenue is NOT shrunk by this change. (But see Watch-outs — revenue-recognition semantics.)

---

## Must-fix before coding

### MF-1 — `invoice.status = "partial"` is an invalid value. Use `"partially_paid"`.
The plan says `status="partial"` in 5 places (target §27, changes §38, journeys §27, verification §60). That value does not exist in the system.
- Schema comment enumerates the valid set and it is `"partially_paid"`, not `"partial"`: `invoices.ts:20-21` — `// "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled"`.
- The sales-detail status-badge map has a `partially_paid` entry (renders "Partially Paid") and **no** `partial` entry: `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx:55`. A `"partial"` value falls through to the default branch (`STATUS_MAP[status] ?? { status: "draft", label: status }` at `:63-66`) and renders a grey "partial" badge.
- `invoices.status` is a plain `text` column (no pg enum), so **no migration is required** — but the value must be exactly `"partially_paid"`. **Correction:** replace every `status="partial"` in the plan with `status="partially_paid"`.

### MF-2 — dueNow tax/price base is wrong for promo-on-package. Backend splits the GROSS item total for principal, the DISCOUNTED base for tax.
Plan §13-14 says `firstInstallmentPrice = calculateInstallmentAmounts(taxBase, N)[0]` where `taxBase = subtotal − discount`. That is NOT what the backend does.
- Backend passes the **gross** item total as the schedule principal: `itemTotal = item.unitPriceCents * item.quantity` (`pos.service.ts:600`), then `createInstallmentSchedule(..., totalPrice: itemTotal, taxAmount: itemTaxAmount, ...)` (`:653-654`).
- But `itemTaxAmount` is derived from the **discounted** `taxCents` (`taxCents = floor(taxBase * bps/10000)`, `taxBase = subtotal − discount`, `:364-365`; `itemTaxAmount = floor(taxCents * itemTotal / totalPackagePrice)`, `:601-604`).
- Net: principal split is on the un-discounted package price; tax split is on the discounted base. For a single package with **no discount** these coincide and the plan's formula is right. **With a promo applied to a package, the plan's `dueNow` principal (`calculateInstallmentAmounts(subtotal−discount, N)[0]`) will not equal the backend's first-installment principal (`calculateInstallmentAmounts(grossItemTotal, N)[0]`).** The cash gate and change-due will be off by up to the per-installment discount share.
- **Correction:** Either (a) the UI helper must split the SAME gross `itemTotal` the backend uses for principal, and the discounted base only for tax; or (b) fix the backend first so the discount is apportioned onto the package principal before the split, then mirror that in the UI. Decide and write it explicitly — today's backend is internally inconsistent (principal ignores the discount, so a discounted package's installments sum to MORE than the discounted price). This must be settled before the UI mirrors anything.

### MF-3 — Stripe/pending path still auto-confirms installment #1. Charging only #1 makes it worse, not neutral.
The plan (Risks §57) says the Stripe path "parks pending" and "due-now still = #1" — implying no interaction. But the auto-confirm block is **not** guarded by payment status:
- `pos.service.ts:645-693`: `if (isInstallmentPlan && installmentPlan)` → creates schedule → unconditionally marks installment #1 `paid`, sets `installmentsPaid=1`, unlocks credits — **even when `paymentMethod === "stripe"`**, for which `invoice.amountPaid=0`, `invoice.status="pending"`, `payment.status="pending"`, and `package_instance.status="pending"` (`:572-573`, `:447-452`, `:630`).
- Today this is a latent inconsistency (pending invoice, but installment #1 "paid"). Under the new model it becomes a **money bug**: `payment.amount` would be set to installment #1, `invoice.amountPaid` to #1 — but nothing has actually been collected (webhook hasn't fired). And the webhook that flips the sale to succeeded has no logic to confirm installment #1 (it doesn't know about the schedule).
- **Correction:** For `paymentMethod === "stripe"` (online), do NOT auto-confirm installment #1 in `recordPosSale`; leave all installments pending and `invoice.amountPaid=0`. Confirmation must happen in the webhook (out of plan scope — flag it). At minimum the plan must state that the stripe branch skips both the auto-confirm AND the first-installment amountPaid write. Note also the frontend uses `paymentMethod: "online"` (`payment-step.tsx:61`) which is NOT in the router enum (`pos.ts:62` accepts `stripe`, not `online`) nor in `PaymentMethod` (`types.ts:44`) — there is an `(m as any)` cast at `payment-step.tsx:171`. Verify how `online` actually reaches the server before relying on the stripe branch at all.

### MF-4 — Reconcile / sequence against 05-17 Task 1.4 and the `outstandingAmount` column (hard dependency, not a "watch-out").
The plan says paymentStatus is set "via existing `syncPackagePaymentStatus`" and to "set `outstandingAmount` if that column exists." Neither is true of the code today, and both are owned by 05-17:
- `recordPosSale` does **not** call `syncPackagePaymentStatus` today — it hardcodes `paymentStatus: isInstallmentPlan ? "partially_paid" : "paid"` at insert (`pos.service.ts:624`) and never calls the sync helper. Wiring that call into the POS block is **exactly 05-17 Phase 1 Task 1.4** (`05-17 plan:409`). Two plans editing the same 8 lines of `recordPosSale` → merge conflict + double-write risk. Per the house rule on shared files, designate ONE owner.
- `outstandingAmount` is **created by 05-17 Phase 1 Task 1.2** as `NOT NULL DEFAULT 0` with a backfill (`05-17 plan:401-404`). This plan must NOT add the column independently (drift-check + duplicate migration). **Correction:** declare 05-17 Phase 1 a prerequisite, or explicitly carve `paymentStatus`/`outstandingAmount`/`syncPackagePaymentStatus` out of this plan's scope and let 05-17 own them. Do not ship both in parallel.

### MF-5 — Receipt mapper will show a partial total/tax against a full subtotal. Plan never names it.
The plan flags "Sales & Payments list" but misses the receipt path, which DOES read `payment.amount/taxAmount/totalAmount`:
- `mapReceiptResponse` (`sales/$id.tsx:664-687`): `subtotal = sum(items.totalPrice)` (full), but `tax = r.payment?.taxAmount` and `total = r.payment?.totalAmount ?? order.totalAmount`. If `payment.totalAmount/taxAmount` become installment #1, the printed receipt shows **full subtotal, #1 tax, #1 total** — internally inconsistent and wrong for a receipt that should reflect the order.
- `pos.getReceiptData` returns `payment.amount/taxAmount/totalAmount` raw (`pos.ts:276-287`), so the break propagates.
- **Correction:** decide what the receipt should show (recommended: full order total as the headline, with a separate "Paid today (1/N)" line driven by the installment rows the response already returns at `pos.ts:312-320`). Update `mapReceiptResponse` to stop deriving the order total from `payment.totalAmount`. Add to the plan's Changes + Verification.

---

## Watch-outs

- **Double-count (pressure-test #1): currently safe, but only because nothing sums `payment.amount` as revenue.** Revenue uses `sales_orders.totalAmount` (`analytics.service.ts:418-435`), commission for packages is deferred to appointment delivery (`pos.service.ts:418-424,746-790`, services/packages skip sale-time commission), and refund math uses paid-installment rows. So once `payment.amount` becomes #1, the #1 amount appears in exactly one place (the payment row = the actual #1 collection) and the schedule carries #2..N. No double-count **today**. The risk is future code that treats `payment.amount` as "sale value" — add an invariant comment at the write site and a test asserting `payment.amount === firstInstallment` for plans.
- **Revenue recognition vs cash collected.** Because revenue is booked off `sales_orders.totalAmount` at sale time, the franchise "earns" the full RM1200 on day 1 while only RM300 is collected. The plan doesn't change this, but if anyone reads `invoice.amountPaid` as "collected revenue" they'll now see RM300 — a *desirable* correction, but confirm Finance expects sales_orders-based revenue (accrual) to stay full while invoice.amountPaid (cash) drops to #1. Name this explicitly so it isn't "discovered" later.
- **`changeDueCents` in the result.** `pos.service.ts:723-728` computes change vs `totalCents`. Plan §41 correctly says to compute vs `dueNow` — make sure the RETURN value path (`:723`) is updated too, not just the cash gate, or the receipt's change-due will be negative/zero for a correct #1 tender.
- **Installment picker shows for plain service items, not just packages.** `payment-step.tsx:131-132`: `packageItems = items.filter(i => i.type === "package" || i.type === "service")`. A cart with a lone *service* (non-package) shows the plan picker, but the backend rejects a plan unless there's exactly one `package` (`pos.service.ts:226-230`). The plan's §48 ("disable picker unless single package item") is the right fix but must filter on `type === "package"` ONLY and require length === 1 — current code is looser on both counts.
- **`creditsRemaining` is a generated column** (`package-instances.ts:49-51`, `COALESCE(credits_unlocked, credits_total) - credits_used`). The plan doesn't touch it, but anything that sets `creditsUnlocked` for #1 already flows through it — fine, just don't try to write `creditsRemaining`.
- **N=1 "pay in full" path is genuinely unchanged** (pressure-test #7): `isInstallmentPlan = !!installmentPlan && installmentsTotal > 1` (`pos.service.ts:610`), so a 1-installment plan never enters the schedule/auto-confirm branch and records full as today. Plan §16/§28 correct. Keep the explicit `N===1 → dueNow = full` guard in the UI helper.

---

## Reconciliation with 05-17

| Concern | 05-17 position | This plan | Conflict? |
|---|---|---|---|
| `syncPackagePaymentStatus` in POS | Task 1.4 adds the call into the POS auto-confirm block (`05-17:409`) | "via existing `syncPackagePaymentStatus`" (§40) — but it isn't wired yet | **YES** — same code region, both write `paymentStatus`. One owner. |
| `outstandingAmount` column | Task 1.2 creates it `NOT NULL DEFAULT 0` + backfill + schema + regen (`05-17:401-404`) | "set if column exists" (§40) | **YES** — do not create it twice; 05-17 owns the migration. |
| `paymentStatus` value | Standardizes on `partially_paid` (`05-17:108,397,440`) | uses `partially_paid` for pkg, but `partial` for invoice (§38) — mismatched | Align: `partially_paid` everywhere (see MF-1). |
| POS payment-method enum | Task 5.6/§240 add `manual_transfer` | uses existing methods | No conflict; already present in router enum (`pos.ts:62`). |
| Auto-confirm #1 semantics | Assumes current-branch auto-confirm is correct and unchanged (`05-17:47,61-62`) | Repurposes the same block to also drive the money model | **Coordinate** — this plan changes amounts written in the block 05-17 assumes is stable. |

**Recommendation:** make 05-17 Phase 1 a hard prerequisite (it delivers `syncPackagePaymentStatus` wiring + `outstandingAmount`), then this plan only changes `payment.amount/totalAmount/taxAmount` + `invoice.amountPaid/status` + the receipt mapper + the UI dueNow. That cleanly separates ownership of the package-instance fields (05-17) from the money fields (this plan).

---

## Missing journeys / tests

- **Promo + installment** (the MF-2 case): no journey. Add one: package on `quarterly` + a percentage promo → assert UI dueNow === backend first-installment collection to the cent, and that installments #1..N sum to the discounted package price (today they sum to the GROSS price — bug to settle first).
- **Stripe/online installment** (MF-3): no journey asserting that a parked-pending online sale leaves ALL installments pending and `invoice.amountPaid = 0`. Add it; it's the case most likely to leak money.
- **Receipt assertion** (MF-5): verification §60 checks `invoice.amountPaid`/installments but never asserts the receipt/`getReceiptData` shows the full order total. Add an explicit check (the plan even says "via API or receipt" — pin it down).
- **Refund-after-partial regression:** add a test that buys on a plan (only #1 paid), then runs `getSuggestedRefund` and asserts `paidAmount` equals only installment #1 (proves it reads installment rows, not the now-partial `invoice.amountPaid`). Cheap guard against a future refactor pointing refund math at `invoice.amountPaid`.
- **Split cart tax apportionment** (pressure-test #3): the plan's §24 correctly identifies that `recordPosSale` step 13 assigns the WHOLE order's tax to the package schedule (`itemTaxAmount = floor(taxCents * itemTotal / totalPackagePrice)` where `totalPackagePrice` = package items only, so for a single package `itemTaxAmount = taxCents` = all tax). Correct apportionment: tax on the package's own discounted base goes to the schedule (split floor-per-installment, remainder on last); tax on non-package items is collected now in `payment.taxAmount`. The remainder absorber must be a single, named line (recommend: non-package "collected now" bucket absorbs the order-level rounding remainder, package schedule uses clean floors) — the plan must specify who eats the cent or two tax tests will flap. No test exists for a split cart; add one (package on plan + product) asserting package-schedule tax = tax on package base only, and collected-now tax = order tax − package-schedule tax.
- **`bun check-types`** on `packages/services` + `apps/web` is in the plan (§61) — keep it; the receipt-mapper change (MF-5) and the `online`/`PaymentMethod` cast (MF-3) are exactly the kind of thing the type gate's blind spots (`as any`) will miss, so the manual receipt check is non-negotiable.
