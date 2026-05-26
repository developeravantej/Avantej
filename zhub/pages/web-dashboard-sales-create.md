# Sales Order (POS Create)

**Route:** `/dashboard/sales/create`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/create.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(pos:create)
**Flow:** POS multi-step flow (step 1-5) — Customer > Items (+Trainers) > Promo > Payment > Confirm
**Last updated:** 2026-05-26

---

## 1. What It Does

**Purpose (user perspective):** Multi-step POS form to record a new sale: select customer, add items (with optional inline trainer assignment), apply promo, select payment method, then confirm and charge.

**Produces:** Timeline-based stepped form (StepCard panels) on left, live order panel + last receipt preview on right.

**On success:**
- Sale recorded via client.pos.recordSale()
- `onSaleCreated(salesOrderId)` called if prop provided; otherwise navigate to /dashboard/sales/:id
- Toast: Sale recorded successfully!
- Last receipt panel populated and printable via `window.print()`

**On failure / error states:**
- Permission guard if !canCreate (inline message, no redirect)
- Org guard if no organizationId (inline message)
- Toast errors on validation or submit failure
- Special error message if `data.cause === "non_client_member"` (staff/admin customer used)

---

## 2. How It Works

**Execution flow:**

1. Load tax rates and default via useQuery on mount
2. If `prefillCustomerId` provided: fetch via client.customerDirectory.getById and auto-select; start at Items step
3. Fetch latest sale via client.salesOrders.getLatest to seed the Last Receipt Preview panel
4. User selects customer type (member or walk-in) — Step 0 (hidden if `hideCustomerStep`)
5. If member: CustomerStep for search/select; clearing with items triggers "Clear cart?" dialog
6. ItemsStep (Step 1): add service/package items or custom lines; service selection triggers async price resolve via client.services.resolvePrice; walk-ins cannot add service/package items
7. TrainerPickerStep: rendered inline in Step 1 when service/package items exist (optional)
8. Tax rate selector and Notes textarea also in Step 1
9. PromoStep (Step 2): optional promo code input and validation
10. PaymentStep (Step 3): select payment method, enter reference/tendered; installment plan and preferred trainer pickers appear when package/service items in cart
11. Confirm (Step 4): order recap table, CartSummary, charge button
12. Submit via client.pos.recordSale()
13. On success: snapshot receipt into lastReceipt state, then navigate/callback

**Inputs:**
- Customer selection or walk-in toggle
- Items (service/package lookup with async price resolve, or custom lines)
- Optional inline trainer assignment per service item
- Promo code (optional)
- Tax rate selector
- Payment method selection
- Payment reference (card / manual_transfer)
- Cash tendered amount (auto-synced to taxed total until manually edited)
- Installment plan (optional, when package/service in cart)
- Preferred trainer (optional, when package/service in cart)
- Notes (textarea)

**State management:**
- TanStack Query: tax-rates, tax-rates-default, installment-plans, services-list, pos-prefill-customer, pos-latest-sale, members-trainers
- Local state: customerTypeMode, selectedCustomer, items, appliedPromo, selectedTaxRateId, taxRates, paymentMethod, paymentReference, amountTenderedCents, selectedInstallmentPlanId, preferredTrainerId, trainerAssignments, notes, currentStep, lastReceipt, clearCartDialogOpen, liveNow (clock)
- Refs: pendingCustomerRef (pending customer during cart-clear dialog), prevSubtotalRef (promo re-validation)

**Outputs:**
- StepCard timeline renders conditionally (done/active/idle states)
- Right panel: live order summary with step timeline + live totals; Last Receipt Preview (printable)
- Toast notifications
- Clear cart confirmation dialog

**Side effects:**
- Queries tax rates on mount
- Queries latest sale on mount (seeds receipt preview)
- Queries installment plans eagerly (always enabled, not lazy)
- Async price resolve per service item selection via client.services.resolvePrice
- Queries trainers list when package/service items in cart (payment step)
- setInterval live clock (1 s tick)
- Records sale on submit
- window.print() on Print button click

---

## 3. What Depends On It

**Calls these API endpoints:**
- client.taxRates.list() — active tax rates
- client.taxRates.getDefault() — default tax rate
- client.installmentPlans.list() — active plans (always eager, not lazy)
- client.customerDirectory.getById() — prefill customer (when prefillCustomerId prop set)
- client.salesOrders.getLatest() — seed last receipt preview on mount
- client.services.list() — service catalog in ItemsStep
- client.services.resolvePrice() — async price per service/branch/customerType in ItemsStep
- client.members.list({ role: "trainer" }) — trainer list in PaymentStep
- client.pos.recordSale() — submit sale

**Uses these components:**
- CustomerStep — member search/select
- ItemsStep — item search/cart (service/package/custom); inline price resolution
- TrainerPickerStep — trainer assignment (embedded inside Items step, not a separate step)
- PromoStep — promo validation
- PaymentStep — payment method, cash tendered, installment plan, preferred trainer
- CartSummary — totals sidebar (used on Confirm step)
- StepCard, TlDot, LiveDot, LockedBadge — timeline UI primitives (defined in pos-workflow.tsx)
- Dialog — "Clear cart?" confirmation
- Accordion, Button, Select, Textarea, Label, LoadingSpinner — UI

**Exported component props (PosWorkflowProps):**
- `prefillCustomerId?: string` — auto-selects a member and skips to Items step
- `showHeader?: boolean` — show/hide the page header with back-link (default true)
- `hideCustomerStep?: boolean` — hide Step 0 entirely (for embedded use with a fixed customer)
- `onSaleCreated?: (salesOrderId: string) => void` — override default navigation on success

**Uses these hooks:**
- useUserContext() — org, permissions
- useNavigate() — redirect
- useApiMutation() — recordSale (wraps useMutation with toast handling)
- useQuery — tax rates, plans, prefill customer, latest sale
- useState, useCallback, useEffect, useRef — state management

**Navigation: who navigates here:**
- Sales list "New Sale" button
- Direct URL
- Can be embedded as a component (hideCustomerStep / onSaleCreated props)

**Navigation: where it goes:**
- On success (default): /dashboard/sales/:id
- Back: /dashboard/sales/view

---

## 4. Data Shapes

**DB tables touched:**
- salesOrders (insert)
- salesOrderItems (insert)
- staffAssignments (insert, if itemTrainerAssignments provided)

**Key types:**
- CustomerType: member | walk_in
- LineItemType: service | package | custom
- CartItem: id, type, refId?, description, quantity, unitPriceCents
- AppliedPromo: code, promotionId, discountCents, description
- PaymentMethod: cash | card | manual_transfer | fpx | stripe | online
- InstallmentPlanOption: id, code, name, numInstallments, pricePremiumBps
- recordSale input: organizationId, customerType, customerId, customerName, branchId, items[], promotionCode, taxRateId, paymentMethod, paymentReference, amountTenderedCents, installmentPlanCode, preferredTrainerId, notes, itemTrainerAssignments

**Payment method notes:**
- `cash` — requires amountTenderedCents >= dueNowCents; change due shown via StatusCallout; auto-syncs to dueNowCents until cashier manually edits
- `card` — optional auth code reference
- `manual_transfer` — reference required (was `bank_transfer` in older code)
- `fpx` — in PaymentMethod type but no UI card; not selectable in current PaymentStep
- `stripe` — in PaymentMethod type but no UI card; not selectable in current PaymentStep
- `online` — shows "payment link will be generated" callout; pos.ts router transforms this to `stripe` before writing to DB

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** (none)

**Not tested (risk areas):** Multi-step flow, prefill customer, async price resolution, cart-clear dialog, promo re-validation, cash tender auto-sync, trainer assignment, submit error handling (non_client_member), receipt print

---

## 6. Notes

- **Branch inference:** Resolved from selectedCustomer.branchId, falling back to the user's own hierarchyScopeId. Branch is required for submit — walk-in sales require the user to be scoped to a branch.
- **Promo re-validation:** On cart subtotal change, promo is cleared with an info toast. Server re-validates on submit.
- **Tax:** Basis points format (600 = 6%), applied to (subtotal - discount). Default tax rate loaded async; cash tender auto-syncs to the taxed total to avoid silent validation failures.
- **Service → Package:** When a user selects a service from the dropdown in ItemsStep, the cart item type is set to `"package"` (not `"service"`). The `hasServiceItems` check in the workflow uses `item.type === "service" && item.refId` for the inline trainer picker but `"package"` || `"service"` for the payment step pickers.
- **Walk-in:** customerType = walk_in, customerId = "anonymous". Service/package add button disabled for walk-ins (tooltip explains).
- **Trainer assignment:** Two surfaces — `TrainerPickerStep` embedded in Step 1 (per-item slot assignments → `itemTrainerAssignments`) and `preferredTrainerId` picker in PaymentStep (single preferred trainer for the whole package purchase). Both are optional.
- **Installment plans:** Eagerly fetched (not lazy) in both the workflow (for selectedPlan lookup) and PaymentStep. Shown only when package/service items in cart.
- **Receipt preview:** Right panel shows Last Receipt Preview seeded from `client.salesOrders.getLatest` on mount, then updated in-session after each sale. Print button triggers `window.print()` with CSS `@media print` that isolates `#pos-receipt-print`. Email button is disabled (stub).
- **Clear cart dialog:** Triggered when changing customer with items in cart. Uses `pendingCustomerRef` to hold the new customer until confirmed.
- **Layout:** Two-column (step cards left, live order + receipt right); left column scrolls independently.
- **Embeddable:** `PosWorkflow` is a standalone exported component; the route file wraps it. `hideCustomerStep` + `onSaleCreated` support embedding in member profiles or other flows.
