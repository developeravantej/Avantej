# Branch Pricing — Execution Run Log

**Session:** `05-07_10-01_branch-pricing`
**Date:** 2026-05-07
**Executor:** Claude Sonnet 4.6

---

## Phases Completed

### Phase 1 — Backend completion
**Status:** DONE

**Files modified:**
- `packages/services/src/pricing.service.ts` — Added 4 missing functions:
  - `expireServicePrice(db, priceId, until?)` — updates `effectiveUntil` to now() or given date
  - `expireProductPrice(db, priceId, until?)` — same for product prices
  - `deleteServicePrice(db, priceId)` — hard delete
  - `deleteProductPrice(db, priceId)` — hard delete
- `packages/api/src/routers/services.ts` — Added 2 new oRPC procedures:
  - `expireBranchPrice` — requires `service_management:update`; loads price row + parent service for access check; throws NOT_FOUND if inaccessible
  - `deleteBranchPrice` — requires `service_management:delete`; same access check pattern
  - Also added import for `servicePrices` schema and new service functions
- `packages/api/src/routers/products.ts` — Added 2 new oRPC procedures:
  - `expireBranchPrice` — requires `inventory:update`
  - `deleteBranchPrice` — requires `inventory:delete`
  - Also added `eq` from drizzle-orm, `productPrices` schema import, new service functions

**Note:** `packages/services/src/index.ts` required no change — already `export * from "./pricing.service"`.

---

### Phase 2 — POS price resolution wiring
**Status:** DONE

**Files modified:**
- `apps/web/src/components/pos/items-step.tsx` — Complete rewrite:
  - Added `selectedCustomer?: SelectedCustomer | null` to `ItemsStepProps`
  - `handleServiceSelect` is now async; calls `client.services.resolvePrice` with branchId + customerType from `selectedCustomer`
  - Race-condition guard via `pendingServiceIdRef` — stale responses from rapid service switching are discarded
  - Loading spinner in price field while `resolvePrice` is in-flight
  - Warning banner when resolved price is 0 (no price configured)
  - Fallback to `svc.price` if `resolvePrice` throws
- `apps/web/src/components/pos/pos-workflow.tsx` — Added `selectedCustomer={selectedCustomer}` prop to `<ItemsStep>`

---

### Phase 3 — Services pricing admin UI
**Status:** DONE

**Files created:**
- `apps/web/src/components/pages/services/pricing-page.tsx` — `ServicePricingPage`:
  - Filter-first UX: empty state until service selected from combobox
  - Table shows: Branch, Customer Type, Price (RM), Effective From, Effective Until, Actions
  - Branch names resolved from `hierarchy.listNodes` (client-side map)
  - Expire/Delete actions with confirmation dialogs
- `apps/web/src/components/pages/services/service-price-override-dialog.tsx` — `ServicePriceOverrideDialog`:
  - Fields: Service, Branch (branch-type nodes only + "Org-wide"), Customer Type, Price RM, Effective From (pre-filled to local now), Effective Until (optional)
  - Calls `client.services.setBranchPrice` on submit

**Files modified:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`:
  - Added `{ id: "pricing", label: "Pricing" }` to `TABS` array
  - Added `ServicePricingPage` import
  - Added `tab === "pricing"` branch to content switch (checked first)

---

### Phase 4 — Products pricing admin UI
**Status:** DONE

**Files created:**
- `apps/web/src/components/pages/products/pricing-page.tsx` — `ProductPricingPage` (mirror of services pricing page, using `products.listPriceOverrides` / `products.expireBranchPrice` / `products.deleteBranchPrice`)
- `apps/web/src/components/pages/products/product-price-override-dialog.tsx` — `ProductPriceOverrideDialog` (mirror of service dialog, using `products.setBranchPrice`)

**Files modified:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx` — Restructured:
  - Added `validateSearch` to route definition: `tab` param defaulting to `"products"`
  - Added `PAGE_TABS = [{ id: "products" }, { id: "pricing" }]` with tab navigation
  - Extracted product list content into `ProductsListTab` sub-component
  - Renders `<ProductPricingPage />` when `tab === "pricing"`
  - Wrapped entire page in the same shell pattern as `service/view.tsx`

---

## Type Check Result

**`bun check-types` from project root: PASS for all modified files.**

Pre-existing errors in `server` package (scripts, admin.ts, hierarchy routes, test infrastructure, auth service) were not introduced by this change and are out of scope.

No errors in:
- `packages/services/src/pricing.service.ts`
- `packages/api/src/routers/services.ts`
- `packages/api/src/routers/products.ts`
- `apps/web/src/components/pos/items-step.tsx`
- `apps/web/src/components/pos/pos-workflow.tsx`
- `apps/web/src/components/pages/services/pricing-page.tsx`
- `apps/web/src/components/pages/services/service-price-override-dialog.tsx`
- `apps/web/src/components/pages/products/pricing-page.tsx`
- `apps/web/src/components/pages/products/product-price-override-dialog.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx`

**`bun check` (Biome/oxlint): PASS for all modified files.** Pre-existing oxlint warnings in scripts and test files remain.

---

## Deviations from Plan

1. **Products access check for `expireBranchPrice`/`deleteBranchPrice`:** The plan says to check the service's `branchId` against `accessibleNodeIds`. For products, the router does not currently track product-level branch scoping (products are not branch-scoped in the schema — only `product_prices.branchId` is). Implemented existence check only (verify price row + product exist in tenant). This is equivalent to the existing `setBranchPrice` pattern for products.

2. **`selectedCustomer` prop in `ItemsStep`:** Made optional (`?`) as specified in the plan, so pos-workflow.tsx can pass it without breaking other embeddings.

3. **Tests not implemented:** Phase list (1-4) does not include tests as a separate phase. Per plan audit notes, tests were tagged as CRITICAL but are not in the phased implementation. Skipped per execution instructions.
