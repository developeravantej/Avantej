# POS / Record Sale

**Route:** `/dashboard/sales/create`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/create.tsx:1`
**Platform:** web
**Auth required:** authenticated + `pos_management:create`
**Last updated:** 2026-04-20 (Pipeline Audit B/C/D)

---

## 1. What It Does

**Purpose:** Receptionist records an in-store sale end-to-end (customer → items → promo → tax → payment → installment → invoice → audit) in one atomic transaction. Printable receipt on completion.

**Produces:** Redirects to `/dashboard/sales/$id` with `{ salesOrderId, salesOrderNumber, invoiceId, invoiceNumber, paymentId, packageInstanceId?, installmentIds?, subtotalCents, discountCents, taxCents, totalCents, changeDueCents? }`. Toast on success.

**On failure:** ORPCError bubbles to toast; form state preserved; entire tenant-DB transaction rolls back — no orphan rows.

---

## 2. How It Works

**Layout:** Two-column on desktop. Left: stepped form (`<Accordion>` defaultValue="customer"). Right: persistent `CartSummary` panel.

**Steps (single page, accordion-style wizard):**
1. **Customer** — Toggle: **Member** | **Walk-in**. Member mode: Combobox via `pos.searchCustomers`. Walk-in mode: `<Select>` from `walkInCustomers.list`; "+ Create New Walk-in Customer" opens inline creation.
2. **Items** — Service / Package / Custom line-items. Rows with qty + unit price + total + trash.
3. **Promotion** (optional) — Code input + Apply via `promotions.validate`.
4. **Tax** — Default rate auto-loaded from `taxRates.getDefault`; dropdown of active rates to override.
5. **Payment** — Method radio (Cash | Card | Bank Transfer). Cash: tendered input + change due. Card/Bank: reference input. Installment plan picker when exactly one Package item.

**Submit flow:**
```
RouteComponent → onSubmit
  → client.pos.recordSale({ customerType, customerId, items, promotionCode?, taxRateId, paymentMethod, ... })
    → posRouter.recordSale       # rbac: pos:create + branch scope
      → recordPosSale(tenantDb, input)   # SINGLE tenantDb.transaction
        1. Validate upstream (package fields: services.sessionCount + expirable + expiryDays)
        2. Validate customer (member OR walk_in); verify branch in accessibleNodeIds
        3. Compute subtotal
        4. Apply promotion (validatePromoCode)
        5. Compute tax (rateInBasisPoints × base / 10000)
        6. Generate numbers (SO-YYYYMMDD-NNNN, PAY-..., INV-...)
        7. INSERT sales_orders (status='confirmed', totalAmount=pre-tax)
        8. INSERT N sales_order_items
        9. INSERT payments (currency='myr' — overrides default 'usd' at POS create site)
        10. INSERT payment_items (line + tax + discount)
        11. If promo: applyPromotion (inc usageCount)
        12. INSERT invoices (status='paid', amountPaid=total)
        13. If package: INSERT package_instances (accepts walkInCustomerId XOR clientId) + createInstallmentSchedule + mark 1st paid
        14. createCommissionSplitsForPos per service/package line item (non-fatal)
        15. writeAudit('sale.create')
```

---

## 3. What Depends On It

**API endpoints:**
- `pos.recordSale` — orchestrator
- `pos.searchCustomers` — cross-DB member search + walk_in ILIKE; returns up to 10 results
- `pos.getReceiptData` — for Print Receipt (called from sales/$id.tsx)
- `promotions.validate`, `services.list`, `taxRates.list` + `.getDefault`, `installmentPlans.list`, `walkInCustomers.create`

**Components:**
- `CustomerStep`, `ItemsStep`, `PromoStep`, `PaymentStep`, `CartSummary`, `ReceiptView` — all in `apps/web/src/components/pos/`

**Navigation: incoming:** `sales/view.tsx` "+ New Sale" button.
**Navigation: outgoing:** `/dashboard/sales/$id` after success.

---

## 4. Data Shapes

**DB tables touched (in tx):**
| Table | Operation |
|-------|-----------|
| `sales_orders` | INSERT |
| `sales_order_items` | INSERT N |
| `payments` | INSERT (currency='myr') |
| `payment_items` | INSERT N + tax + discount |
| `invoices` | INSERT |
| `promotion_usages` | INSERT (if promo applied) |
| `package_instances` | INSERT (if package item) |
| `installments` | INSERT schedule + 1st marked paid (if installment plan) |
| `audit_logs` | INSERT (`sale.create`) |

**Walk-in customers:** supported via `walkInCustomerId` on `package_instances` (XOR constraint with `clientId` — exactly one must be set). Walk-in + package is now valid as of migration 0027.

**POS validation (Stream D):** `unitPriceCents >= 0 && quantity >= 1` required; `discountCents` may not exceed `subtotalCents`.

---

## 5. Tests

None yet. Chrome-verified: page renders, customer search returns "Bryan Voo Khai Qi" with Member badge, cart summary shows RM 0.00 placeholders, Charge & Confirm correctly disabled.

---

## 6. Notes

- **Currency override at POS create site only.** `payments.currency` default is `'usd'` elsewhere. Other phases unchanged.
- **No idempotency key.** Double-submit mitigated by disabling Charge & Confirm button on click. Document risk.
- **Sequence numbering:** SELECT MAX pattern inside the tx (no postgres sequence). Adequate at tenant scale.
- **Permission cache bug:** if user can't see this page despite DB grants, clear localStorage — see `memory/feedback_stale_permission_cache.md`.
- Shipped in tracking-pages plan phase 4 (2026-04-19).
