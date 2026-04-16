# Inventory Options

**Route:** `/dashboard/inventory-options`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/inventory-options.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Single consolidated page for managing inventory reference data — Brands, Product Categories, and Suppliers — without leaving the page.
**Produces:** Three card sections: Brands table, Categories table, Suppliers table, each with inline create/edit/delete/deactivate actions.
**On success:** Changes reflected immediately via query invalidation; success toasts shown.
**On failure / error states:** Loading spinner while all three queries are pending; error toasts on mutation failure; "Select an organization" guard when no org context.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → <InventoryOptionsDashboard />
       → useUserContext() → organizationId
       → useQuery(brands.list)             → client.brands.list({ organizationId })
       → useQuery(productCategories.list)  → client.productCategories.list({ organizationId })
       → useQuery(suppliers.list)          → client.suppliers.list({ organizationId })
       → Mutations: brands.create/update/delete, productCategories.create/update/delete,
                    suppliers.create/update/deactivate
       → <BrandDataTable>, <CategoryDataTable>, <SupplierDataTable>
```

**Inputs:** No URL params. All actions are inline within each sub-table.
**State management:** TanStack Query for fetching; mutations for CUD operations. Each table's open/close state is managed inside its own DataTable component.
**Outputs:** Renders three data tables; mutations invalidate matching query keys.
**Side effects:** Cache keys `["brands", orgId]`, `["productCategories", orgId]`, `["suppliers", orgId]` invalidated on success.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `brands.list` / `brands.create` / `brands.update` / `brands.delete`
- `productCategories.list` / `productCategories.create` / `productCategories.update` / `productCategories.delete`
- `suppliers.list` / `suppliers.create` / `suppliers.update` / `suppliers.deactivate`

**Uses these components:**
- `InventoryOptionsDashboard` — `apps/web/src/components/merge-tables/inventory-options-dashboard.tsx` — all data fetching and mutation logic lives here
- `DataTable` (brands) — `apps/web/src/components/tables/brands/view/data-table.tsx`
- `CategoryDataTable` — `apps/web/src/components/tables/categories/view/data-table.tsx`
- `SupplierDataTable` — `apps/web/src/components/tables/suppliers/view/data-table.tsx`

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`

**Navigation: who navigates here:**
- App sidebar under Inventory section → "Inventory Options" link

**Navigation: where it goes:** No outbound navigation; self-contained CRUD.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `brands` | SELECT / INSERT / UPDATE / DELETE | `id`, `name`, `organizationId` |
| `product_categories` | SELECT / INSERT / UPDATE / DELETE | `id`, `name`, `organizationId` |
| `suppliers` | SELECT / INSERT / UPDATE / soft-delete | `id`, `name`, `description`, `accountNumber`, `paymentTerms`, `contactPerson`, `contactPhone`, `officePhone`, `email`, `website`, `barcode`, `isActive` |

**Brand form fields:** `name` (required)
**Category form fields:** `name` (required)
**Supplier form fields:** `name` (required), `description`, `accountNumber`, `paymentTerms`, `contactPerson`, `contactPhone`, `officePhone`, `email`, `website`, `barcode`

---

## 5. Tests

**Test files:** None found directly for this route or `InventoryOptionsDashboard`. Brand and category data tables have separate tests in `apps/web/src/__tests__/routes/brands.test.tsx` and `apps/web/src/__tests__/routes/categories.test.tsx`.
**Not tested:** The combined inventory-options page itself, supplier mutations, loading/error states.

---

## 6. Notes

- The route file is a thin shell — all logic lives in `InventoryOptionsDashboard`.
- "Products Assigned" column in brands and categories data is hardcoded to `0` — not computed from real data.
- `externalCode` field in categories data is hardcoded to `""`.
- Supplier deactivate uses soft-delete (`isActive = false`) rather than physical deletion; suppliers do not have a delete endpoint.
