# Best-guess product decisions — sign-off needed

Three deferred items were built with sensible defaults because they were product
calls, not bugs. Each is isolated and cheap to change now. Confirm or respecify.
Commit: `cd1f9361` on `audit-prove/remediation-20260529-1240`.

---

## 1. Credit-point redemption value (F-CRM-02)

**What shipped:** `customer_profiles.credit_points` was write-only (stored, never
spent). Added an append-only `credit_point_ledger` table + `redeemCreditPoints` /
`adjustCreditPoints` services, and wired POS so a customer can redeem points as a
discount at checkout.

**Assumptions baked in (all flagged in code comments):**
| Assumption | Value | Where to change |
|---|---|---|
| Redemption rate | **1 point = 1 cent** of discount | `pos.service.ts` (Step 4b) + migration `0081` comment |
| Eligibility | **members only** (walk-ins throw `BAD_REQUEST`) | `pos.service.ts` redemption block |
| Over-request behavior | **clamp** to `min(requested, post-promo subtotal, balance)` — never fails the sale | `pos.service.ts` clamp |
| Tax treatment | credit discount **reduces the taxable base** (like the promo discount) | `pos.service.ts` taxBase calc |
| Earning | **not implemented** — no rule mints points yet (only manual `adjustCreditPoints`) | n/a — needs a product rule |

**Decide:** Is 1pt=1¢ correct? Should points reduce tax base or apply post-tax?
Do walk-ins earn/redeem? **What earns points in the first place?** (Currently nothing
auto-earns — the redemption path exists but the balance only grows via manual adjust.)

**Reversibility:** High. If rejected, the ledger table is harmless (unused) and the
POS input is optional; remove the redemption block + input.

---

## 2. `resolveReview` permission union (F-COM-05)

**What shipped:** Creating a manual commission adjustment requires
`commission_payout:create`; resolving the resulting `pending_review` split required
`commission_review:resolve`. An operator with only the former couldn't resolve their
own adjustment (dead-end). Now `resolveReview` accepts **either** permission.

**Assumption:** payout operators who can create adjustments are trusted to resolve
the ones they created (self-serve), while dedicated reviewers (holding only
`commission_review:resolve`) are unaffected.

**Decide:** Is self-approve acceptable, or do you require **separation of duties**
(creator ≠ approver)? If SoD is required, revert this and instead grant a combined
role to the operators who legitimately need both.

**Where:** `packages/api/src/routers/commission-splits/review.procedures.ts`.
**Reversibility:** High — one guard, revert the `hasPermission` fallback.

---

## 3. Supplier-invoice editability (F-INV-04)

**What shipped:** Supplier invoices were immutable after creation (only
dispute/match/pay). Added `updateInvoice` allowing edits to `invoiceNumber`,
`totalCents`, `taxCents`, `invoiceDate` **while status is `pending` or `disputed`**;
`matched`/`paid` invoices reject edits.

**Tension:** the original immutability may have been a deliberate financial-controls
choice (an invoice is a received document; you dispute rather than edit it).

**Decide:** Allow correcting pending/disputed invoices (current), or keep them
immutable (revert) and require delete-and-recreate / dispute flow instead?

**Where:** `packages/services/src/goods-receipt.service.ts` (`updateSupplierInvoice`)
+ `packages/api/src/routers/goods-receipts.ts` (`updateInvoice`).
**Reversibility:** High — remove the service fn + procedure (no schema change to undo).

---

## Recommendation
1 and 3 are low-stakes — defaults are reasonable; confirm and move on. **#2 (self-approve)
is the one to scrutinize** — if your finance controls require separation of duties,
that default is wrong and should be reverted before merge.
