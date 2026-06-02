# Domain Audit: Inventory, Products & SaaS Platform

## Executive Summary

Comprehensive audit of the Inventory/Products/SaaS domain across 11 API routers and 18 service files. 
Coverage includes purchase order + goods receipt lifecycle, supplier invoice 3-way matching, tax rates, 
brands, categories, units of measure, onboarding, and SaaS billing (subscriptions, Stripe Connect, admin). 

**Key Findings:**
- Core inventory workflows (PO → receipt → invoice match) are well-implemented with proper transactional boundaries and audit logging
- Stock adjustment logic is atomic with overflow guards
- 3-way invoice matching validates tolerance correctly
- **Gap 1**: Purchase order lacks supplier notification on approval (async event missing)
- **Gap 2**: Goods receipt cancel does not audit or notify (partial implementation)
- **Gap 3**: receiveItems handler in PO router without coordinating with goods-receipt create flow (dual writes at risk)
- **Gap 4**: No endpoint to update supplier invoice details post-creation
- **Gap 5**: Transfer orders have fulfillment but no explicit receive/acceptance workflow
- **Gap 6**: Stripe Connect webhook handler not found (account.updated assumed external)

---

## Endpoints / Procedures

### packages/api/src/routers/purchase-orders.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenant, read | List POs by supplier/branch/status with pagination | listPurchaseOrders |
| getById | tenant, read | Fetch single PO with line items | getPurchaseOrderById |
| create | tenant, create | Create draft PO with items, calculate subtotal | createPurchaseOrder |
| approve | tenant, update | Move PO from draft→approved, audit logged | approvePurchaseOrder |
| receiveItems | tenant, update | Increment received qty per PO item (legacy path) | receiveItems |
| cancel | tenant, delete | Cancel draft/approved PO, audit logged | cancelPurchaseOrder |

### packages/api/src/routers/goods-receipts.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| listForPo | tenant, read | List all GR for a PO | listReceiptsForPo |
| getById | tenant, read | Fetch GR + items | getReceiptById |
| create | tenant, update | Post GR, update PO status, increment stock | createReceipt |
| cancel | tenant, update | Reverse GR: undo stock & PO receivedQty | cancelReceipt |
| createInvoice | tenant, create | Create supplier invoice (pending) | createSupplierInvoice |
| listInvoices | tenant, read | List invoices by status/supplier | listSupplierInvoices |
| matchInvoice | tenant, update | 3-way match PO≈receipt≈invoice, validate tolerance | markInvoiceMatched |
| disputeInvoice | tenant, update | Mark invoice disputed with reason | disputeInvoice |
| markInvoicePaid | tenant, update | Move matched→paid | markInvoicePaid |
| getInvoicePreview | tenant, read | Compute 3-way match preview (diagnostics) | getInvoicePreview |

### packages/api/src/routers/suppliers.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenant, read | List suppliers with optional search/active filter | listSuppliers |
| getById | tenant, read | Fetch single supplier | getSupplierById |
| create | tenant, create | Create supplier with contact details | createSupplier |
| update | tenant, update | Update supplier fields | updateSupplier |
| deactivate | tenant, update | Soft-deactivate supplier | deactivateSupplier |

### packages/api/src/routers/tax-rates.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenant, read (clients allowed) | List active tax rates | listTaxRates |
| getById | tenant, read (clients allowed) | Fetch single tax rate | getTaxRateById |
| getDefault | tenant, read (clients allowed) | Get org default tax rate | getDefaultTaxRate |
| create | tenant, create | Create new tax rate, optionally set as default | createTaxRate |
| update | tenant, update | Modify tax rate (no default swap) | updateTaxRate |
| setDefault | tenant, update | Swap default, audit logged | setDefaultTaxRate |
| deactivate | tenant, delete | Deactivate rate (unset if default) | deactivateTaxRate |

### packages/api/src/routers/brands.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenant, read | List brands with optional search | listBrands |
| getById | tenant, read | Fetch single brand | getBrandById |
| create | tenant, create | Create brand | createBrand |
| update | tenant, update | Update brand | updateBrand |
| delete | tenant, delete | Delete brand | deleteBrand |

### packages/api/src/routers/product-categories.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenant, read | List categories with optional search | listProductCategories |
| getById | tenant, read | Fetch single category | getProductCategoryById |
| create | tenant, create | Create category with external code | createProductCategory |
| update | tenant, update | Update category | updateProductCategory |
| delete | tenant, delete | Delete category | deleteProductCategory |

### packages/api/src/routers/units-of-measure.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenant, read | List UOMs with optional search | listUnitsOfMeasure |
| getById | tenant, read | Fetch single UOM | getUomById |
| create | tenant, create | Create UOM with conversion factor | createUom |
| update | tenant, update | Update UOM | updateUom |
| delete | tenant, delete | Delete UOM | deleteUom |

### packages/api/src/routers/onboarding.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| getInviteContext | public | Return org/branch branding for landing page | getInviteContext |
| redeemInvite | public | Validate token, create auth user & member, issue session | redeemBranchInvite |

### apps/server/src/routers/subscriptions.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| createCheckoutSession | protected | Generate Stripe Checkout URL for tier | (factory creates router) |
| getStatus | protected | Return org sub state (active/past_due/trialing/none) | (factory creates router) |
| billingPortal | protected | Return Stripe Customer Portal URL | (factory creates router) |

### apps/server/src/routers/stripe-connect.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| createOnboardingUrl | protected | Build Stripe Connect OAuth URL (signed state) | (factory creates router) |
| getAccountStatus | protected | Return per-country charges/payouts/details flags | (factory creates router) |
| listCountryAccounts | protected | List all country-level Connect accounts | (factory creates router) |


### apps/server/src/routers/admin.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| (Many platform admin procedures for tenants, billing, health, etc.) | admin | Platform-level oversight | Various |

---

## Logic Functions Summary

### packages/services/src/purchase-orders.service.ts
- generatePONumber() — Create date-sequenced PO number
- listPurchaseOrders() — Query POs with filters
- getPurchaseOrderById() — Fetch PO + line items
- createPurchaseOrder() — Insert PO header + items
- approvePurchaseOrder() — Move draft→approved, audit
- receiveItems() — Increment receivedQty per item
- cancelPurchaseOrder() — Cancel draft/approved, audit

### packages/services/src/goods-receipt.service.ts
- createReceipt() — Post GR, update stock & PO status
- cancelReceipt() — Reverse GR: undo stock & PO receivedQty
- getReceiptById() — Fetch GR + items
- listReceiptsForPo() — List GR for PO
- computeReceiptTotalCents() — Sum receipt for 3-way match
- markInvoiceMatched() — 3-way match validation, audit
- createSupplierInvoice() — Insert invoice (pending)
- listSupplierInvoices() — Query invoices
- disputeInvoice() — Move pending/matched→disputed
- markInvoicePaid() — Move matched→paid
- getInvoicePreview() — Compute 3-way match diagnostics

### Other Services (Brief)
- stock-requests.service.ts: Create, approve, fulfill, reject stock requests
- transfer-orders.service.ts: Create, mark in-transit, complete transfers
- products.service.ts: CRUD products, stock adjustment (atomic with zero-floor guard)
- suppliers.service.ts: CRUD suppliers, deactivate (soft)
- tax-rates.service.ts: CRUD tax rates, set default, deactivate
- brands.service.ts: CRUD brands
- product-categories.service.ts: CRUD categories
- units-of-measure.service.ts: CRUD UOMs
- onboarding.service.ts: 5-step branch self-signup (idempotent)
- pricing.service.ts: Resolve prices with specificity chain, list/set/expire overrides
- tax.service.ts: Resolve tax rate at timestamp
- organization-settings.service.ts: Key/value store for org config
- ghl-staff-sync.service.ts: Dispatch staff sync to GoHighLevel

---

## Gaps (Prioritized)

### P1 — PO Approval Missing Supplier Notification
**File:** purchase-orders.ts:136, purchase-orders.service.ts:192-242  
**Status:** missing | **Testable:** true

When a PO moves to "approved", no async event is triggered to notify the supplier. 
Supplier has no signal to begin fulfillment.

**Expected behavior:**
- Enqueue async task with supplier email + PO context
- Supplier receives notification email
- Audit record tracks notification sent

**Persistence:**
```
table: supplier_notifications (NEW)
where: { supplierId, purchaseOrderId }
expect: { 
  status: "pending_send" | "sent" | "failed",
  notificationType: "po_approved",
  sentAt: Date | null
}
```

---

### P1 — Goods Receipt Cancel Missing Audit Log
**File:** goods-receipt.service.ts:172-245  
**Status:** partial | **Testable:** true

cancelReceipt() reverses stock correctly but does NOT call writeAudit(). 
Finance and compliance cannot see who cancelled receipts and why.

**Expected behavior:**
- Audit log with actor, action="goods_receipt.cancel", summary with receipt number and stock impact

---

### P2 — receiveItems Conflicts with Goods Receipt Create
**File:** purchase-orders.ts:152-178 vs goods-receipt.ts:56-100  
**Status:** partial | **Testable:** true

Two distinct code paths both increment stock and update PO state:
- purchaseOrders.receiveItems (legacy)
- goodsReceipts.create (canonical)

Risk of double-increments and no receipt document linkage.

**Recommendation:** Deprecate receiveItems; all receipts go through goodsReceipts.create.

---

### P2 — No Update Endpoint for Supplier Invoices
**File:** goods-receipt.ts:126-155  
**Status:** missing | **Testable:** true

Once created, supplier invoices cannot be modified (totalCents, taxCents, invoiceDate, etc.).

**Expected behavior:**
- Add updateInvoice endpoint for pending/disputed invoices
- Validate cannot update matched/paid invoices

---

### P2 — Transfer Orders Lack Receive/Acceptance State
**File:** transfer-orders.service.ts:158-206  
**Status:** partial | **Testable:** true

TO workflow jumps from in_transit → completed in one call. No intermediate "received, pending acceptance" state.

**Expected behavior:**
- Add goods_received_at_destination state
- OR: Allow incremental item receipt before completion

---

### P2 — Stripe Connect Webhook Handler Scope
**File:** stripe-connect.ts § Webhook Handling  
**Status:** partial | **Testable:** false

Webhook handler is "outside oRPC in webhooks.routes.ts" (external to audit scope).
Cannot verify account.updated webhook handling.

**Note:** This is a scoping issue, not a missing feature.

---

### P2 — createReceipt Missing PO Delivery Date Validation
**File:** goods-receipt.service.ts:76-166  
**Status:** partial | **Testable:** true

No check that receivedAt aligns with PO expectedDeliveryDate (may indicate wrong PO or transit loss).

**Expected behavior:**
- Optional validation: if receivedAt outside expected window (±X days), warn or error
- Log discrepancy for audit

---

### P2 — Stock Adjustment Missing Audit Trail
**File:** products.service.ts:180-232  
**Status:** partial | **Testable:** true

adjustStock() has no log linking changes to source document (GR, SR, TO).

**Expected behavior:**
- Create stock_movements table with delta, reason, source document ID/type

---

### P2 — 3-Way Match Diagnostics Unclear
**File:** goods-receipt.service.ts:308-374  
**Status:** partial | **Testable:** true

Error messages don't distinguish "receipt is partial (ongoing)" vs "price mismatch" vs "invoice error".

**Expected behavior:**
- Better diagnostics in getInvoicePreview explaining root cause

---

### P3 — Tax Rate Effective Dates Unvalidated
**File:** tax-rates.service.ts:57-88  
**Status:** partial | **Testable:** true

No validation that effectiveUntil > effectiveFrom (if both present).

**Expected behavior:**
- Service validates date range

---

### P3 — Products Missing Deletion Prevention
**File:** products.service.ts § No delete endpoint  
**Status:** missing | **Testable:** false

No hard delete endpoint; soft-delete via status='discontinued' is pattern but undocumented.

**Expected behavior:**
- Document soft-delete pattern OR implement hard delete with cascade/FK checks

---

### P3 — Supplier Deactivate Missing Active PO Check
**File:** suppliers.service.ts:109-123  
**Status:** partial | **Testable:** true

deactivateSupplier() allows deactivation mid-procurement without validation.

**Expected behavior:**
- Validate no active POs; if they exist, error or log warning

---

## Summary Statistics

| Severity | Count | Testable |
|----------|-------|----------|
| P1 | 2 | 2 |
| P2 | 7 | 6 |
| P3 | 3 | 1 |
| **Total** | **12** | **10** |

---

## Final Takeaways

1. **Strengths**: Core inventory workflows are well-implemented with transactions, row locks, and audit trails.
2. **Main Gap**: Dual-write paths (receiveItems + createReceipt) risk stock mismatches; consolidate to single canonical path.
3. **Missing Side-Effects**: Supplier notifications, goods receipt cancel audit, stock movement logs not implemented.
4. **Workflow Gaps**: Transfer orders and goods receipt handling need refinement for real-world scenarios (incremental receipt, validation).
5. **Testable Findings**: 10 of 12 gaps are testable and can be addressed incrementally.

