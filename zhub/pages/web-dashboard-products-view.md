# Products View

**Route:** `/dashboard/products/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-09

---

## New in this update

- **Pricing tab added** to the route: the page now has a two-tab layout (Products | Pricing). The `?tab=` URL search param controls which view is shown.
- **`ProductPricingPage`** is a new component (`apps/web/src/components/pages/products/pricing-page.tsx`) for managing per-branch price overrides per product. Mirrors the service pricing page in structure and behavior.
- **`ProductPriceOverrideDialog`** is a new form dialog (`apps/web/src/components/pages/products/product-price-override-dialog.tsx`) for creating product branch price overrides (product, branch, customer type, price in RM, effectiveFrom, optional effectiveUntil).
- **`products` router** has two new procedures: `expireBranchPrice` and `deleteBranchPrice`.
- Products query is now enabled only when `tab === "products"` to avoid unnecessary fetches when on the Pricing tab.

---

## 1. What It Does

**Purpose (user perspective):** Browse, create, and update the product catalog; and manage per-branch price overrides for products — all from a single tabbed page.

**Tabs:**
| Tab | Component | Purpose |
|-----|-----------|---------|
| Products | `ProductsListTab` (inline) | Product CRUD table with status filter |
| Pricing | `ProductPricingPage` | Branch price overrides per product |

Tab state is kept in the URL search param `?tab=` (default: `"products"`).

**Produces:**
- Products tab: a table of products with status-tab filtering (All / Active / Inactive / Discontinued); inline "Add Product" and "Edit Product" flows via the DataTable.
- Pricing tab: a product selector dropdown → table of overrides with Branch, Customer Type, Price, Effective From, Effective Until, and Expire/Delete actions.

**On success:**
- Create/update product: toast notifications and `orpc.products.list.key()` partial-match cache invalidation.
- Add price override: `["product-price-overrides", organizationId, selectedProductId]` invalidated; dialog closes.
- Expire/Delete override: same invalidation; confirmation dialog closes.

**On failure / error states:**
- No organization: "Select an organization to view products." (Products tab) / "Select an organization to manage pricing." (Pricing tab).
- Loading: `<PageLoader />` centered spinner.
- API error (Products tab): destructive message + "Try Again" button.
- Empty product list: `<EmptyState>` with Package icon and "No products found".
- Pricing tab, no product selected: dashed-border empty state "Select a product above to view its price overrides."
- Pricing tab, no overrides: "No price overrides configured for this product."

---

## 2. How It Works

**Execution flow — Products tab:**
```
ProductsViewPage
  → Route.useSearch() → tab
  → useUserContext() → organizationId
  → statusFilter state (undefined | "active" | "inactive" | "discontinued")
  → useQuery(orpc.products.list.queryOptions({ organizationId, status }))
      enabled: !!organizationId && tab === "products"
      → productsRouter.list → requirePermission("inventory", "read")
  → useProductData(organizationId) → brands, productCategories, suppliers, unitsOfMeasure
  → maps API data to ProductRow[]
  → <ProductsListTab>
      → status tab buttons (All / Active / Inactive / Discontinued)
      → <EmptyState> if tableData.length === 0
      → <DataTable columns data organizationId brands categories suppliers uoms />
          → "Add Product" → create sheet (client.products.create)
          → row edit → edit sheet (client.products.update)
```

**Execution flow — Pricing tab:**
```
ProductsViewPage → tab === "pricing" → <ProductPricingPage />
  → useUserContext() → organizationId
  → useQuery(orpc.products.list.queryOptions({ organizationId }))
  → useQuery(["hierarchy-nodes", organizationId]) → listNodes → branchMap
  → selectedProductId state (from dropdown)
  → useQuery(["product-price-overrides", orgId, selectedProductId])
      → client.products.listPriceOverrides({ organizationId, productId })
  → "Add Override" → <ProductPriceOverrideDialog>
      → form: productId, branchId (__org_wide__ → null), customerType (__all__ → null),
               priceRm (rmToCents), effectiveFrom (datetime-local), effectiveUntil (optional)
      → client.products.setBranchPrice(...)
      → onSuccess → invalidate overrides cache
  → "Expire" row button → confirm dialog → client.products.expireBranchPrice({ organizationId, priceId })
  → "Delete" row button → confirm dialog → client.products.deleteBranchPrice({ organizationId, priceId })
```

**State management:**
- `tab` in URL search params (TanStack Router `validateSearch`, default `"products"`)
- `statusFilter` local state in `ProductsViewPage` (passed down to `ProductsListTab`)
- `selectedProductId`, `addDialogOpen`, `expireConfirmId`, `deleteConfirmId`, `isExpiring`, `isDeleting` local state in `ProductPricingPage`
- TanStack Query cache keyed on `orpc.products.list.key()` and `["product-price-overrides", ...]`

**Inputs:**
- Tab clicks → URL search param update
- Status filter tab clicks → `setStatusFilter(value)`
- Product form fields: SKU, name, barcode, type, brand, category, supplier, UoM, price, status
- Price override form: product, branch, customer type, price (RM), effectiveFrom, effectiveUntil

**Outputs:**
- Products table columns: image placeholder, Name, SKU (copyable), Type (badge), Barcode, Price (MYR), Status (badge), Conv. Factor
- Overrides table columns: Branch, Customer Type, Price, Effective From, Effective Until, Actions (Expire/Delete)

**Side effects:**
- `queryClient.invalidateQueries({ queryKey: orpc.products.list.key() })` on product create/update — partial-match covers all status filter variants
- `queryClient.invalidateQueries({ queryKey: ["product-price-overrides", orgId, productId] })` on override add/expire/delete

---

## 3. What Depends On It

**Calls these API endpoints:**
- `products.list` — list products filtered by status; requires `inventory:read`.
- `products.create` — create new product; requires `inventory:create`.
- `products.update` — update existing product; requires `inventory:update`.
- `products.listPriceOverrides` — list branch price overrides for a product.
- `products.setBranchPrice` — create a new branch price override.
- `products.expireBranchPrice` — set effectiveUntil to now on an override.
- `products.deleteBranchPrice` — permanently delete an override.
- `brands.list`, `productCategories.list`, `suppliers.list`, `unitsOfMeasure.list` — via `useProductData` for form dropdowns.
- `hierarchy.listNodes` — fetch hierarchy nodes to build branch name map for pricing table and override form.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/products/view/data-table.tsx`
- `columns` / `ProductRow` — `apps/web/src/components/tables/products/view/columns.tsx`
- `ProductPricingPage` — `apps/web/src/components/pages/products/pricing-page.tsx` — **NEW**
- `ProductPriceOverrideDialog` — `apps/web/src/components/pages/products/product-price-override-dialog.tsx` — **NEW**
- `PageHeader` — `apps/web/src/components/ui/page-header.tsx`
- `EmptyState` — `apps/web/src/components/ui/empty-state.tsx`
- `PageLoader` — `apps/web/src/components/ui/loading-spinner.tsx`
- `Button` — `apps/web/src/components/ui/button.tsx`

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`
- `useProductData` — `apps/web/src/hooks/useProductData.ts` — fetches brands, categories, suppliers, UoMs
- `useQuery`, `useQueryClient` (TanStack Query)
- `Route.useSearch()`, `Route.useNavigate()` (TanStack Router)

**Navigation: who navigates here:** Sidebar "Sales & Inventory → Inventory → Products" link.

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `products` | SELECT / INSERT / UPDATE | `id`, `sku`, `name`, `barcode`, `type`, `brandId`, `categoryId`, `supplierId`, `uomId`, `conversionFactor`, `price`, `status`, `createdAt`, `updatedAt` |
| `product_price_overrides` | SELECT / INSERT / UPDATE | `id`, `productId`, `branchId`, `customerType`, `priceCents`, `effectiveFrom`, `effectiveUntil` |
| `brands` | SELECT | `id`, `name` |
| `product_categories` | SELECT | `id`, `name` |
| `suppliers` | SELECT | `id`, `name` |
| `units_of_measure` | SELECT | `id`, `name` |
| `hierarchy_nodes` | SELECT | `id`, `name`, `type` |

**Key types:**
```typescript
interface ProductRow {
  id: string; sku: string; name: string;
  barcode?: string | null; type?: string | null;
  brandId?: string | null; categoryId?: string | null;
  supplierId?: string | null; uomId?: string | null;
  conversionFactor?: string | null;
  price: number; // integer cents
  status?: string | null; // "active" | "inactive" | "discontinued"
  createdAt?: string | null; updatedAt?: string | null;
}

// Price override row from products.listPriceOverrides
{
  id: string; productId: string; branchId: string | null;
  customerType: "member" | "walk_in" | null;
  priceCents: number; effectiveFrom: Date | null; effectiveUntil: Date | null;
}
```

---

## 5. Tests

**Test files:**
- `apps/web/src/__tests__/routes/products.test.tsx` — frontend component tests

**Scenarios covered:** renders empty state, calls `client.products.list` on mount, product data shown in table, price formatted as MYR currency (cents → RM).

**Not tested:** Pricing tab interactions, price override create/expire/delete, tab navigation, status filter, create/update mutation flows, error state rendering, form validation.

---

## 6. Notes

- **Pricing override branchId sentinel:** `"__org_wide__"` in the Select → `null` submitted to API. `"__all__"` for customerType → `null`. Displayed in the table as "Org-wide / All branches" or "All".
- **Price input:** Collected in RM (decimal string) via `rmToCents()` from `@/lib/money`. `formatPrice(row.priceCents)` (no currency arg) used in table display.
- **Expire vs Delete:** Expire sets `effectiveUntil` to now (record preserved). Delete permanently removes the row. Both require confirmation dialogs.
- **Products query guard:** `enabled: !!organizationId && tab === "products"` prevents the products list from fetching when on the Pricing tab. The Pricing page fires its own separate products list query (without the tab guard) for the product selector dropdown.
- `useProductData` fires four separate queries concurrently; enabled only when `organizationId` is present.
- `orpc.products.list.key()` partial-match invalidation covers all status filter variants of the products list query.
- Price is stored and displayed in integer cents; `formatPrice(price, "MYR")` handles formatting in the products table.
- The columns file imports from `@tanstack/table-core` (not `react-table`) — be consistent if extending column definitions.
