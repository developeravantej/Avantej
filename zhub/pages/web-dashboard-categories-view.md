# Product Categories View

**Route:** `/_authenticated/dashboard/_layout/categories/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/categories/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (server requires `inventory:read/create/update/delete`)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Manage product categories used to organize the product catalog (e.g., Clothing, Supplements, Equipment).
**Produces:** A data table of product categories showing name, external code, and product count, with inline add/edit/delete actions.
**On success:** Create/update/delete each invalidate the categories query and show a sonner toast.
**On failure / error states:** "Select an organization" prompt if no org. Spinner while loading. Error state with "Try Again" button on fetch failure. Empty state text when no categories exist.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → currentOrganizationId
  → useQuery([orpc.productCategories.list.key(...)]) → client.productCategories.list({ organizationId })
      → productCategoriesRouter.list
          → requirePermission(tenantDb, member, "inventory", "read")
          → listProductCategories(tenantDb)
  → useQuery(["products", orgId]) → client.products.list({ organizationId })
      [parallel fetch for product counts]
  → productCountByCategory = useMemo(Map<categoryId, count>)
  → tableData: CategoryRow[] = categories.map(c => ({ ID, Name, externalCode, "Products Assigned" }))
  → DataTable (columns, tableData, ...)

  createMutation → client.productCategories.create({ organizationId, name, externalCode?, description? })
  updateMutation → client.productCategories.update({ organizationId, id, name?, externalCode?, description? })
  deleteMutation → client.productCategories.delete({ organizationId, id })
  [all invalidate productCategories.list query on success]
```

**Inputs:** No URL/query params.
**State management:** Only TanStack Query + mutation state. No local state for dialogs (managed inside DataTable component).
**Outputs:** `DataTable` from `apps/web/src/components/tables/categories/view/data-table.tsx` with `CategoryRow` shape.
**Side effects:** None beyond DB writes.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `productCategories.list` — fetch all product categories
- `productCategories.create` — create category
- `productCategories.update` — update name/externalCode/description
- `productCategories.delete` — delete category
- `products.list` — fetch products to compute per-category product counts (read-only, parallel)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/categories/view/data-table.tsx`
- `columns` — `apps/web/src/components/tables/categories/view/columns.tsx` (exports `CategoryRow`)

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — Sales & Inventory → Inventory → "Categories"

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `product_categories` (tenant) | SELECT, INSERT, UPDATE, DELETE | `id`, `name`, `externalCode`, `description` |
| `products` (tenant) | SELECT | `id`, `categoryId` (for counts only) |

**CategoryRow (table display type):**
```typescript
{
  ID: string;
  Name: string;
  externalCode: string;
  "Products Assigned": number;
}
```

**Form fields (Add/Edit dialog in DataTable):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| name | text | required (min 1) | `productCategories.create/update.name` |
| externalCode | text | optional | `productCategories.create/update.externalCode` |
| description | text | optional | `productCategories.create/update.description` |

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/categories.test.tsx`
**Scenarios covered:**
- Renders without crashing (empty state, "No results." shown)
- `client.productCategories.list` is called on mount (verifies it uses `productCategories` not `categories`)
- "Add Category" button is visible
- Shows category name in table when data returned

**Not tested (risk areas):**
- Create/update/delete mutations
- `productCountByCategory` computation and display
- Error state with "Try Again"
- `products.list` being called in parallel

---

## 6. Notes

- The API router is `productCategories` (not `categories`) — the test explicitly verifies this naming. The sidebar link says "Categories" but the procedure is `productCategoriesRouter`.
- This page fetches all products just to compute per-category counts via a client-side `useMemo`. This is a potentially expensive operation if there are many products; there is no server-side aggregation.
- `invalidate()` uses the oRPC key helper (`orpc.productCategories.list.key(...)`) rather than a plain string array, which is more robust to key shape changes.
- Deleting a category with assigned products may succeed at the API level if there is no FK constraint enforcing referential integrity — check `product_categories` schema.
