# Product Categories View

**Route:** `/dashboard/categories/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/categories/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lists all product categories for the organization and allows creating, editing, and deleting categories inline via the data table.

**Produces:** A data table with columns: ID, Name, External Code, Products Assigned (count). Inline add/edit/delete via table actions.

**On success:** Toast confirmation; category list refetches via query invalidation.

**On failure / error states:**
- No `organizationId`: empty message "Select an organization to view categories."
- Loading: centered spinner.
- API error: error message with "Try Again" button.
- Empty state: "No categories yet" message above the (empty) table.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → useQuery(orpc.productCategories.list.key) → client.productCategories.list({ organizationId })
  → useQuery(["products", orgId]) → client.products.list({ organizationId })
  → useMemo → productCountByCategory (Map<categoryId, count>)
  → tableData: CategoryRow[] = categories mapped with product count
  → <DataTable columns data onAdd onEdit onDelete isMutating />
      → onAdd → createMutation → client.productCategories.create
      → onEdit → updateMutation → client.productCategories.update
      → onDelete → deleteMutation → client.productCategories.delete
```

**Inputs:** No URL/query params; driven by current org.

**State management:** Query key uses oRPC-derived key `orpc.productCategories.list.key(...)`. No local dialog state (managed inside `DataTable`).

**Outputs:** CRUD operations on product categories; query invalidated on each mutation success.

**Side effects:** Query invalidation after create/update/delete.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.productCategories.list` — list all categories for the org
- `client.products.list` — count products per category
- `client.productCategories.create` — create a new category
- `client.productCategories.update` — update category name/externalCode/description
- `client.productCategories.delete` — delete a category

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/categories/view/data-table.tsx` — table with add/edit/delete actions
- `columns` — `apps/web/src/components/tables/categories/view/columns.tsx` — `CategoryRow` column definitions
- `Button` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — org context
- `useQuery` — categories list + products list
- `useMutation` — create/update/delete
- `useQueryClient` — cache invalidation
- `useMemo` — product count aggregation

**Navigation: who navigates here:** `app-sidebar.tsx` — "Categories" link under Inventory/Products section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `product_categories` | SELECT | `id`, `name`, `externalCode`, `description` |
| `product_categories` | INSERT | `name`, `externalCode`, `description`, `organizationId` |
| `product_categories` | UPDATE | `name`, `externalCode`, `description` |
| `product_categories` | DELETE | `id` |
| `products` | SELECT | `id`, `categoryId` (for count) |

**`CategoryRow` type:**
```ts
{ ID: string; Name: string; externalCode: string; "Products Assigned": number }
```

**Create mutation input fields:** `name` (required), `externalCode` (optional), `description` (optional)

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/categories.test.tsx`

**Scenarios covered:**
- Renders without crashing (empty state)
- (Additional scenarios in test file beyond the visible snippet)

**Not tested:** Create/update/delete mutations with UI interaction, error state rendering, product-count aggregation

---

## 6. Notes

- Structurally mirrors `brands/view.tsx` closely — same pattern of list + product count join.
- Products query uses a plain string key `["products", organizationId]` — shared with `brands/view.tsx`; both queries could race for the same cache slot if rendered simultaneously, but in practice only one page is mounted at a time.
- No `beforeLoad` permission guard.
