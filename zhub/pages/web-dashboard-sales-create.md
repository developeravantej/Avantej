# Sales Order (POS Create)

**Route:** `/dashboard/sales/create`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/create.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(pos:create)
**Flow:** POS multi-step flow (step 1-5) — Customer > Items > Promo > Payment > Trainers (optional)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Multi-step POS form to record a new sale: select customer, add items, apply promo, select payment, assign trainers (optional).

**Produces:** Accordion-based stepped form on left, cart summary on right. Step badges show progress.

**On success:**
- Sale recorded via client.pos.recordSale()
- Navigate to /dashboard/sales/:id
- Toast: Sale recorded successfully

**On failure / error states:**
- Permission guard if !canCreate
- Org guard if no organizationId
- Toast errors on validation or submit failure

---

## 2. How It Works

**Execution flow:**

1. Load tax rates and default via useQuery
2. User selects customer type (member or walk-in)
3. If member: CustomerStep component for search/select
4. If walk-in: show info badge, no customer record
5. ItemsStep: add items to cart (products or services)
6. PromoStep: optional promo code input and validation
7. PaymentStep: select payment method (cash, card, bank_transfer, installment)
8. If service items: TrainerPickerStep for trainer assignment
9. Submit via client.pos.recordSale() with all form data
10. On success: redirect to order detail

**Inputs:**
- Customer selection or walk-in toggle
- Items search and add to cart
- Promo code (optional)
- Payment method selection
- Trainer assignments (optional)
- Notes (textarea)

**State management:**
- TanStack Query: tax-rates, tax-rates-default, installment-plans
- Local state: customer, items, promo, tax, payment, notes, trainers, accordion step
- Effect: promo re-validation on cart subtotal change

**Outputs:**
- Accordion steps render conditionally
- Cart summary updates in real-time
- Step badges show completion status
- Toast notifications

**Side effects:**
- Queries tax rates on mount
- Lazy queries installment plans
- Records sale on submit
- Navigation on success

---

## 3. What Depends On It

**Calls these API endpoints:**
- client.taxRates.list() — active tax rates
- client.taxRates.getDefault() — default tax rate
- client.installmentPlans.list() — active plans (lazy)
- client.pos.recordSale() — submit sale

**Uses these components:**
- CustomerStep — member search
- ItemsStep — item search/cart
- PromoStep — promo validation
- PaymentStep — payment selection
- TrainerPickerStep — trainer assignment
- CartSummary — totals sidebar
- Accordion, Button, Select, Textarea — UI

**Uses these hooks:**
- useUserContext() — org, permissions
- useNavigate() — redirect
- useQuery — tax rates, plans
- useMutation — recordSale
- useState, useCallback, useEffect — state management

**Navigation: who navigates here:**
- Sales list "New Sale" button
- Direct URL

**Navigation: where it goes:**
- On success: /dashboard/sales/:id
- Back: /dashboard/sales/view

---

## 4. Data Shapes

**DB tables touched:**
- salesOrders (insert)
- salesOrderItems (insert)
- staffAssignments (insert, if trainers)

**Key types:**
- CustomerType: member | walk_in
- CartItem: id, type, refId, description, quantity, unitPriceCents
- AppliedPromo: code, discountCents
- PaymentMethod: cash | card | bank_transfer | installment
- recordSale input: organizationId, customerType, customerId, customerName, branchId, items[], promotionCode, taxRateId, paymentMethod, paymentReference, amountTenderedCents, installmentPlanCode, notes, itemTrainerAssignments

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** (none)

**Not tested (risk areas):** Multi-step flow, cart operations, promo validation, payment validation, trainer assignment, submit error handling

---

## 6. Notes

- **Branch inference:** From customer search or org member scope
- **Promo re-validation:** On cart change, promo cleared; server re-validates on submit
- **Tax:** Basis points format (600 = 6%), applied to (subtotal - discount)
- **Payment methods:** Cash requires tender >= total; Card/Bank optional reference; Installment requires plan
- **Trainer assignments:** Services only; filtered by branch
- **Customer toggle:** Switching clears items, promo, assignments
- **Walk-in:** customerType = walk_in, customerId = anonymous, no customer record
- **Layout:** Two-column (accordion left, summary right); responsive mobile

