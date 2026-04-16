# Products View

**Route:** `/dashboard/products/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Browse, create, and update the product catalog (physical goods and service items) for the organization.
**Produces:** A table of products with status-tab filtering; inline "Add Product" and "Edit Product" flows via the DataTable.
**On success:** Products appear in the table; create/update mutations show toast notifications and invalidate the query.
**On failure / error states:**
- No organization: "Select an organization to view products."
- Loading: centered spinner.
- API error: destructive message with a "Try Again" button.
- Empty filtered result: "No products found" empty state above the table.

---

## 2. How It Works

**Execution flow:**
```
ProductsViewPage
  → useUserContext() → organizationId
  → statusFilter state (All / Active / Inactive / Discontinued tabs)
  → useQuery via orpc.products.list.queryOptions({ organizationId, status })
      → productsRouter.list (packages/api/src/routers/products.ts)
        → requirePermission(tenantDb, member, "inventory", "read")
        → listProducts(tenantDb, { brandId, categoryId, supplierId, status, search })
  → useProductData(organizationId)  [brands, productCategories, suppliers, unitsOfMeasure]
  → createMutation → client.products.create  (inventory:create)
  → updateMutation → client.products.update  (inventory:update)
  → maps to ProductRow[]
  → <DataTable columns data onProductCreate onProductUpdate isCreating isUpdating brands categories suppliers uoms />
```

**Inputs:** Status filter tab; product form fields within `DataTable` (SKU, name, barcode, type, brand, category, supplier, UoM, price, status).
**State management:** `statusFilter` local state; TanStack Query cache keyed on `orpc.products.list.key()`.
**Outputs:** Table with columns: image placeholder, Name, SKU (copyable), Type (badge), Barcode, Price (MYR), Status (badge), Conv. Factor.
**Side effects:** `queryClient.invalidateQueries({ queryKey: orpc.products.list.key() })` on create/update success — partial-match invalidation covers all status filters.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `products.list` — list products filtered by status; requires `inventory:read`.
- `products.create` — create new product; requires `inventory:create`.
- `products.update` — update existing product; requires `inventory:update`.
- `brands.list`, `productCategories.list`, `suppliers.list`, `unitsOfMeasure.list` — via `useProductData` for form dropdowns.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/products/view/data-table.tsx` — table with embedded create/edit sheet.
- `columns` / `ProductRow` — `apps/web/src/components/tables/products/view/columns.tsx`.
- `Button` — `apps/web/src/components/ui/button.tsx` — "Try Again" error recovery.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `useProductData` — `apps/web/src/hooks/useProductData.ts` — fetches brands, categories, suppliers, UoMs.
- `useQuery`, `useMutation`, `useQueryClient` (TanStack Query).

**Navigation: who navigates here:** Sidebar "Sales & Inventory → Inventory → Products" link (`apps/web/src/components/app-sidebar.tsx:168`).
**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `products` | SELECT / INSERT / UPDATE | `id`, `sku`, `name`, `barcode`, `type`, `brandId`, `categoryId`, `supplierId`, `uomId`, `conversionFactor`, `price`, `status` |
| `brands` | SELECT | `id`, `name` |
| `product_categories` | SELECT | `id`, `name` |
| `suppliers` | SELECT | `id`, `name` |
| `units_of_measure` | SELECT | `id`, `name` |

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
type CreateProductInput = { sku, name, barcode?, type?, brandId?, categoryId?, supplierId?, uomId, conversionFactor?, price, status? }
type UpdateProductInput = Partial<CreateProductInput>
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/products.test.ts` (service-layer unit tests).
**Scenarios covered:** `listProducts`, `createProduct`, `updateProduct`, `getProductById` at the service layer.
**Not tested:** Frontend component (status tabs, empty/error states, create/update mutation flows).

---

## 6. Notes

- Uses `orpc.products.list.key()` for cache invalidation — this is a partial match that covers all filter variants of the products list query.
- `useProductData` fires four separate queries concurrently; these are enabled only when `organizationId` is present and the component is mounted.
- The service columns file imports from `@tanstack/table-core` (not `react-table`) — be consistent if extending column definitions.
- Price is stored and displayed in integer cents; `formatPrice(price, "MYR")` handles formatting.
