# Service Category View

**Route:** `/_authenticated/service-category/view`
**File:** `apps/web/src/routes/_authenticated/service-category/view.tsx:1`
**Platform:** web
**Auth required:** rbac(service_management:read)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Displays a searchable table of all service categories in the current organization with full CRUD operations.
**Produces:** A table with name, status, and action columns for each service category; includes Add, Edit, Detail, and Delete (deactivate) flows via modals.
**On success:** Categories load from the API and are displayed in a striped table with a global text search filter.
**On failure / error states:** Loading spinner while fetching. Error message shown inline if API fails. "No organization selected" message if `currentOrganizationId` is null.

---

## 2. How It Works

**Execution flow:**
```
ServiceCategoryViewComponent
  → useUserContext() → currentOrganizationId
  → useQuery(["service-categories", orgId])
    → client.serviceCategories.list({ organizationId, isActive: undefined })
      → serviceCategoriesRouter.list
        → requirePermission(tenantDb, member, "service_management", "read")
        → listServiceCategories(tenantDb, { accessibleNodeIds })
          → tenant DB: service_categories table
  → <DataTable> (apps/web/src/components/tables/service-category/view/data-table.tsx)
    → On row click: <ServiceCategoryDetailDialog>
    → "Add" button: <ServiceFormDialog mode="create">
    → Edit action: useQuery(["serviceCategory", "edit", id]) →
        client.serviceCategories.getById + client.serviceCategoryConfig.getByCategoryId
      → <ServiceFormDialog mode="edit" initialData={...}>
    → Delete action: client.serviceCategories.update({ isActive: false }) (soft-delete)
```

**Inputs:** None (no URL params or query params)
**State management:**
- TanStack Query: `["service-categories", organizationId]` (30s stale time)
- DataTable local state: `globalFilter`, `isAddDialogOpen`, `isEditDialogOpen`, `isDetailDialogOpen`, `selectedCategoryId`, `editCategoryId`
- Edit data fetched on demand: `["serviceCategory", "edit", id, orgId]`

**Outputs:** Rendered table; create/edit/deactivate mutations via child dialogs calling `onSuccess()` which triggers `refetch()`
**Side effects:** `client.serviceCategories.update` (soft-delete) on delete action; toast notifications for success/failure

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceCategories.list` — fetch all categories for org
- `serviceCategories.getById` — fetch single category for edit pre-fill
- `serviceCategoryConfig.getByCategoryId` — fetch config (duration, incentives, booking rules) for edit pre-fill
- `serviceCategories.update` — soft-delete (isActive: false)
- `serviceCategories.create` / `serviceCategories.update` — via ServiceFormDialog

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/service-category/view/data-table.tsx` — table shell with search, Add button, row click handlers
- `ServiceFormDialog` — `apps/web/src/components/forms/service-category-form.tsx` — create/edit modal
- `ServiceCategoryDetailDialog` — `apps/web/src/components/forms/service-category-detail-dialog.tsx` — detail view with edit/delete triggers

**Uses these hooks:**
- `useUserContext` — retrieves `currentOrganizationId`
- `useQuery` (TanStack Query) — data fetching

**Navigation: who navigates here:**
- App sidebar: "Service Categories" under Services group → `/dashboard/service-category/view` (note: sidebar points to the `/dashboard/...` twin, not this standalone route)
- `requirePermission` guard in `beforeLoad` redirects to `/dashboard` if permission absent (stub — no real client enforcement)

**Navigation: where it goes:** Stays on page; all interactions open dialogs in-place

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `service_categories` | SELECT, UPDATE | `id`, `name`, `isActive`, `branchId` |
| `service_category_config` | SELECT | `categoryId`, `defaultDuration`, `defaultMaxAttendees`, `incentiveType`, `paymentStructures`, `staffWeightage`, `requireAdvanceBooking`, `cancellationCutoffHours` |

**Key types / Zod schemas:**
- `serviceCategories.list` input: `{ organizationId: uuid, branchId?: uuid|null, isActive?: boolean }`
- `serviceCategories.update` input for deactivate: `{ organizationId: uuid, id: uuid, isActive: false }`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** RBAC redirect in `beforeLoad` (stub); soft-delete cascade effect on services; edit pre-fill when config is missing (caught with `.catch(() => null)`)

---

## 6. Notes

- `requirePermission` in `beforeLoad` is a stub — it does NOT enforce anything client-side; actual enforcement happens server-side in each procedure.
- "Delete" is a soft-delete (sets `isActive: false`) not a hard delete.
- There are duplicate route trees: `/_authenticated/service-category/view` and `/_authenticated/dashboard/_layout/service-category/view`. The sidebar links to the dashboard version. This standalone version is an alternative entry point.
- Edit pre-fill fetches both category and config in parallel; config failure is silently swallowed via `.catch(() => null)`.
