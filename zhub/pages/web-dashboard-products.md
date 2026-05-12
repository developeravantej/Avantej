# Products

**Route:** `/dashboard/products/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage product catalog — create, update, filter by status (active/inactive/discontinued).
**Produces:** Filterable product table with inline/modal editing, status tabs, empty state with CTA.
**On success:** Product list rendered; create/update mutations trigger cache refresh + success toast.
**On failure / error states:** Loading spinner; error UI with retry button; "Select an organization" prompt if no org.

---

## 2. How It Works

**Execution flow:** Component mount → get organizationId from useUserContext → query orpc.products.list() → fetch brands/categories/suppliers/uoms via useProductData hook → map API response to ProductRow → render table with mutation handlers
**Inputs:** organizationId (from session); statusFilter (local state)
**State management:** TanStack Query `...orpc.products.list.queryOptions()` + `.key()` for partial invalidation; local statusFilter state; two mutations (create, update)
**Outputs:** DataTable<ProductRow> with onProductCreate/onProductUpdate handlers; status filter tabs
**Side effects:** On create/update success: invalidate all products.list queries + toast; on error: toast error message

---

## 3. What Depends On It

**Calls these API endpoints:**
  - `orpc.products.list.queryOptions({ organizationId, status? })` — fetches products; uses TanStack Query integration
  - `client.products.create({ organizationId, ...data })` — creates new product
  - `client.products.update({ organizationId, id, ...data })` — updates product
  - `orpc.brands.list.queryOptions(...)` — fetches brands (via useProductData)
  - `orpc.productCategories.list.queryOptions(...)` — fetches categories
  - `orpc.suppliers.list.queryOptions(...)` — fetches suppliers
  - `orpc.unitsOfMeasure.list.queryOptions(...)` — fetches UOMs
**Uses these components:**
  - `DataTable` — `@/components/tables/products/view/data-table` — table + inline edit
  - columns — `@/components/tables/products/view/columns` — column definitions
  - `EmptyState` — shows when no products exist
**Uses these hooks:** useUserContext, useQuery, useMutation, useProductData
**Navigation: who navigates here:** Dashboard sidebar link
**Navigation: where it goes:** None

---

## 4. Data Shapes

**DB tables touched:** tenantDb: products (R/W), brands (R), product_categories (R), suppliers (R), units_of_measure (R)
**Key types / Zod schemas:**
  - CreateProductInput: `{ sku, name, barcode?, type?, brandId?, categoryId?, supplierId?, uomId, conversionFactor?, price (cents), status? }`
  - UpdateProductInput: same fields, all optional
  - ProductRow (table): maps API response with ISO date strings

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
  - Status filter persistence (resets on mount)
  - Optimistic updates (no optimistic UI)
  - Concurrent create/update conflicts
  - Form validation errors (delegated to DataTable component)
  - Large product lists (pagination not visible; assumes reasonable dataset size)

---

## 6. Notes

- Uses `orpc.products.list.key()` for broad cache invalidation (matches all status filters)
- Empty state shows CTA to "Create your first product"
- Price is stored in cents (integer); DataTable responsible for formatting
- Status filter tabs: undefined (All) | "active" | "inactive" | "discontinued"
- No org selected → "Select an organization" guard before loading check
