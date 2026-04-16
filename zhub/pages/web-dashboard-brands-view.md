# Brands View

**Route:** `/dashboard/brands/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/brands/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lists all product brands for the organization and allows creating, editing, and deleting brands inline via the data table.

**Produces:** A data table with columns: ID, Name, Products Assigned (count). Inline add/edit/delete via table actions.

**On success:** Toast confirmation; brand list refetches via query invalidation.

**On failure / error states:**
- No `organizationId`: empty message "Select an organization to view brands."
- Loading: centered spinner.
- API error: error message with "Try Again" button.
- Empty state: "No brands yet" message above the (empty) table.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → useQuery(orpc.brands.list.key) → client.brands.list({ organizationId })
  → useQuery(["products", orgId]) → client.products.list({ organizationId })
  → useMemo → productCountByBrand (Map<brandId, count>)
  → tableData: BrandRow[] = brands mapped with product count
  → <DataTable columns data onAdd onEdit onDelete isMutating />
      → onAdd → createMutation → client.brands.create
      → onEdit → updateMutation → client.brands.update
      → onDelete → deleteMutation → client.brands.delete
```

**Inputs:** No URL/query params; driven by current org.

**State management:**
- `_editTarget`, `_deleteTarget` — local state (currently unused beyond type tracking; dialog state managed inside `DataTable`)
- Query key: `orpc.brands.list.key({ input: { organizationId } })` (oRPC-derived key)

**Outputs:** CRUD operations on brands table; query invalidated on each mutation success.

**Side effects:** Query invalidation after create/update/delete.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.brands.list` — list all brands for the org
- `client.products.list` — count products per brand
- `client.brands.create` — create a new brand
- `client.brands.update` — update brand name/description
- `client.brands.delete` — delete a brand

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/brands/view/data-table.tsx` — table with add/edit/delete actions
- `columns` — `apps/web/src/components/tables/brands/view/columns.tsx` — `BrandRow` column definitions
- `Button` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — org context
- `useQuery` — brands list + products list
- `useMutation` — create/update/delete
- `useQueryClient` — cache invalidation
- `useMemo` — product count aggregation

**Navigation: who navigates here:** `app-sidebar.tsx` — "Brands" link under Inventory/Products section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `brands` | SELECT | `id`, `name`, `description` |
| `brands` | INSERT | `name`, `description`, `organizationId` |
| `brands` | UPDATE | `name`, `description` |
| `brands` | DELETE | `id` |
| `products` | SELECT | `id`, `brandId` (for count) |

**`BrandRow` type:**
```ts
{ ID: string; Name: string; "Products Assigned": number }
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/brands.test.tsx`

**Scenarios covered:**
- Renders without crashing (empty state)
- (Additional scenarios in test file beyond the visible snippet)

**Not tested:** Create/update/delete mutations with UI interaction, error state rendering, product-count aggregation

---

## 6. Notes

- `_editTarget` and `_deleteTarget` state variables are declared but prefixed `_` — their write calls (`setEditTarget`, `setDeleteTarget`) are unused stubs; the actual edit/delete dialogs are managed inside `DataTable`.
- Products query uses a plain string key `["products", organizationId]` while the brands query uses the oRPC-derived key — inconsistent but functional.
- No `beforeLoad` permission guard.
