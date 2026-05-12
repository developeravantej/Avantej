# Service Categories

**Route:** `/dashboard/service-category/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/service-category/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-22

---

## 1. What It Does

**Purpose (user perspective):** Lets admins browse, create, edit, and deactivate service categories for their organization.
**Produces:** A searchable table of service categories with inline add/edit dialogs and a detail view.
**On success:** Query cache is invalidated via `handleSuccess()` after any mutation.
**On failure / error states:** Spinner while loading; "Select an organization" prompt if no `organizationId`; empty row message if no categories.

---

## 2. How It Works

**Execution flow:**
```
ServiceCategoryViewPage
  → useUserContext() → organizationId
  → useQuery(["serviceCategories", organizationId])
      → client.serviceCategories.list({ organizationId })
  → DataTable (service-category/view/data-table)
      → internally: client.serviceCategories.getById (edit prefetch)
      → internally: client.serviceCategoryConfig.getByCategoryId (edit prefetch)
      → ServiceFormDialog (create/edit)
      → ServiceCategoryDetailDialog (row click detail view)
      → CategoryCommissionForm (Commission Config button click)
      → client.serviceCategories.update({ isActive: false }) (deactivate)
```

**Inputs:** No URL params. Derives `organizationId` from user context. Each row has a 'Commission Config' button that opens a `CategoryCommissionForm` sheet.
**State management:** TanStack Query for list data; dialog/filter state lives inside `DataTable` component.
**Outputs:** Renders table with search; opens Sheet dialogs for create/edit; opens detail dialog on row click.
**Side effects:** `queryClient.invalidateQueries(["serviceCategories", organizationId])` on any mutation success.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceCategories.list` — fetch all categories
- `serviceCategories.getById` — prefetch for edit dialog
- `serviceCategories.update` — soft-delete (set `isActive: false`)
- `serviceCategoryConfig.getByCategoryId` — fetch config for edit dialog; also used by `CategoryCommissionForm`
- `serviceCategoryConfig.upsert` — create or update booking rules + commission config for a category; called from `ServiceFormDialog` on save
- `categoryCommission.getByCategory` — fetch commission configuration for a category (called from `CategoryCommissionForm`)
- `categoryCommission.upsert` — create or update commission configuration (permission: `category_commission_management`)
- `categoryCommission.delete` — delete commission configuration (permission: `category_commission_management`)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/service-category/view/data-table.tsx` — table with add/edit/detail dialogs
- `ServiceFormDialog` — `apps/web/src/components/forms/service-category-form.tsx` — create/edit form
- `ServiceCategoryDetailDialog` — `apps/web/src/components/forms/service-category-detail-dialog.tsx` — detail read view
- `CategoryCommissionForm` (`@/components/forms/category-commission-form.tsx`) — Sheet-based form for commission configuration (payment type, conditional toggle, coach slots, tier rates/conditions)

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`
- `useQuery` / `useQueryClient` — data fetching and cache management

**Navigation: who navigates here:**
- App sidebar → "Service Categories" link (`/dashboard/service-category/view`)

**Navigation: where it goes:** Stays on this page; dialogs are modal overlays.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `service_categories` | SELECT (list, getById) | `id`, `name`, `isActive`, `organizationId` |
| `service_categories` | UPDATE | `isActive` (set false for deactivate) |
| `service_category_config` | SELECT | `categoryId`, `defaultDuration`, `defaultMaxAttendees`, `maxStaff`, `requireAdvanceBooking`, `minAdvanceHours`, `enableCancellationWindow`, `cancellationCutoffHours`, `bufferTimeMinutes` |
| `service_category_config` | UPSERT (on conflict `category_id`) | all configurable fields except `id` |

---

## 5. Tests

**Test files:** None found for this specific route.

**Not tested:** Create, edit, deactivate flows; dialog open/close; search filter; error states.

---

## 6. Notes

- There are two route files for service categories: an older one at `apps/web/src/routes/_authenticated/service-category/view.tsx` and the active dashboard-layout version. The sidebar links to the dashboard version.
- Deactivation is a soft-delete via `update({ isActive: false })`, not a dedicated `delete` procedure.
- The `DataTable` component fetches edit data itself (not passed from the page), calling both `getById` and `getByCategoryId` in parallel when an edit is triggered.
