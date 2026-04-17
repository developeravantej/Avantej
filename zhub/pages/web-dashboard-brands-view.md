# Brands View

**Route:** `/_authenticated/dashboard/_layout/brands/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/brands/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (server requires `inventory:read/create/update/delete`)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Manage product brands used to organize the product catalog (e.g., Nike, Adidas, Generic).
**Produces:** A data table of brands showing name and product count, with inline add/edit/delete actions.
**On success:** Create/update/delete each invalidate the brands query and show a sonner toast.
**On failure / error states:** "Select an organization" prompt if no org. Spinner while loading. Error state with "Try Again" button on fetch failure. Empty state text when no brands exist.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → currentOrganizationId
  → useQuery([orpc.brands.list.key(...)]) → client.brands.list({ organizationId })
      → brandsRouter.list
          → requirePermission(tenantDb, member, "inventory", "read")
          → listBrands(tenantDb, { search? })
  → useQuery(["products", orgId]) → client.products.list({ organizationId })
      [parallel fetch for product counts]
  → productCountByBrand = useMemo(Map<brandId, count>)
  → tableData: BrandRow[] = brands.map(b => ({ ID, Name, "Products Assigned" }))
  → DataTable (columns, tableData, ...)

  createMutation → client.brands.create({ organizationId, name, description? })
  updateMutation → client.brands.update({ organizationId, id, name?, description? })
  deleteMutation → client.brands.delete({ organizationId, id })
  [all invalidate orpc.brands.list key on success]
```

**Inputs:** No URL/query params.
**State management:**
- `_editTarget`, `_deleteTarget` — declared but unused (prefixed `_`); dialog state is managed inside DataTable
- TanStack Query + mutation pending states

**Outputs:** `DataTable` from `apps/web/src/components/tables/brands/view/data-table.tsx` with `BrandRow` shape.
**Side effects:** None beyond DB writes.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `brands.list` — fetch all brands
- `brands.create` — create brand
- `brands.update` — update name/description
- `brands.delete` — delete brand
- `products.list` — fetch products to compute per-brand counts (read-only, parallel)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/brands/view/data-table.tsx`
- `columns` — `apps/web/src/components/tables/brands/view/columns.tsx` (exports `BrandRow`)

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — Sales & Inventory → Inventory → "Brands"

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `brands` (tenant) | SELECT, INSERT, UPDATE, DELETE | `id`, `name`, `description`, `isActive` |
| `products` (tenant) | SELECT | `id`, `brandId` (for counts only) |

**BrandRow (table display type):**
```typescript
{
  ID: string;
  Name: string;
  "Products Assigned": number;
}
```

**Form fields (Add/Edit dialog in DataTable):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| name | text | required (min 1) | `brands.create/update.name` |
| description | text | optional | `brands.create/update.description` |

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/brands.test.tsx`
**Scenarios covered:**
- Renders without crashing (empty state, "No results." shown)
- "Add Brand" button is rendered
- "Filter brands..." placeholder input is rendered
- Shows brand name in table when data returned
- `brands.list` is called during render

**Not tested (risk areas):**
- Create/update/delete mutations
- `productCountByBrand` computation and display
- Error state with "Try Again"
- `products.list` parallel fetch
- `_editTarget` / `_deleteTarget` state (declared but unused)

---

## 6. Notes

- `_editTarget` and `_deleteTarget` are declared with `useState` but never read (they're underscore-prefixed). The actual dialog state is managed entirely inside `DataTable`. These are dead state variables and can be removed.
- Like categories, this page fetches all products to compute brand-level product counts client-side. No server aggregation.
- `invalidate()` uses the oRPC key helper (`orpc.brands.list.key(...)`) for consistency with the query key used in `useQuery`.
- The `brands` router supports an optional `search` parameter in `list`, but this page does not expose a search input — search filtering is handled inside DataTable if at all.
