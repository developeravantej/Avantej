# Service Category View

**Route:** `/service-category/view`
**File:** `apps/web/src/routes/_authenticated/service-category/view.tsx:1`
**Platform:** web
**Auth required:** rbac(service_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Browse, search, create, edit, and deactivate service categories for the current organization.

**Produces:** A searchable table of service categories, with inline access to add/edit via modal dialogs and view detail via a detail dialog.

**On success:** Categories load immediately; create/edit/deactivate operations trigger a refetch and a success toast.

**On failure / error states:**
- No `organizationId` → message "No organization selected."
- API error → destructive error message rendered above the table.
- Loading → "Loading..." placeholder inside the table border.

---

## 2. How It Works

**Execution flow:**
```
ServiceCategoryViewComponent
  → useUserContext() → organizationId
  → useQuery(client.serviceCategories.list) → categories[]
  → DataTable (service-category/view/data-table)
      → ServiceFormDialog (create)
      → ServiceFormDialog (edit) + useQuery(getById + getByCategoryId)
      → ServiceCategoryDetailDialog (read-only detail + deactivate)
```

**Inputs:** None from URL; `organizationId` from user context.

**State management:** TanStack Query (`queryKey: ["service-categories", organizationId]`, `staleTime: 30s`). Edit/detail dialogs managed by `DataTable` internal state.

**Outputs:** Renders `DataTable` with `columns` from `service-category/view/columns.tsx`.

**Side effects:** Deactivate calls `client.serviceCategories.update({ isActive: false })` then calls `onSuccess` (refetch).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceCategories.list` — fetch all categories (with optional `isActive` filter)
- `serviceCategories.getById` — load category for edit mode
- `serviceCategoryConfig.getByCategoryId` — load booking/commission config for edit
- `serviceCategories.update` — soft-delete (deactivate) a category

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/service-category/view/data-table.tsx` — table shell, dialogs, search
- `ServiceFormDialog` — `apps/web/src/components/forms/service-category-form.tsx` — create/edit form
- `ServiceCategoryDetailDialog` — `apps/web/src/components/forms/service-category-detail-dialog.tsx` — read-only detail + deactivate

**Uses these hooks:**
- `useUserContext` — resolves current `organizationId`
- `useQuery` (TanStack Query) — data fetching

**Navigation: who navigates here:**
- App sidebar link: "Service Categories" → `/service-category/view` (under Services section)
- Dashboard service-category route inside `_layout` (`apps/web/src/routes/_authenticated/dashboard/_layout/service-category/view.tsx`) appears to be a duplicate/alias route

**Navigation: where it goes:** Stays on same page; dialogs are in-place.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `service_categories` | SELECT | `id`, `name`, `isActive`, `organizationId` |
| `service_category_config` | SELECT | `categoryId`, `defaultDuration`, `defaultMaxAttendees`, `incentiveType`, `isConditional`, `maxStaff`, `staffPoolPercentage`, `requireAdvanceBooking`, `minAdvanceHours`, `cancellationCutoffHours`, `bufferTimeMinutes` |
| `service_categories` | UPDATE | `isActive = false` |

**Key types / Zod schemas:**
- `serviceCategories.list` input: `{ organizationId: uuid, isActive?: boolean }`
- `serviceCategoryConfig.getByCategoryId` input: `{ organizationId: uuid, categoryId: uuid }`

---

## 5. Tests

**Test files:** None found specifically for this route.

**Not tested (risk areas):**
- Edit flow requiring two parallel API calls (category + config)
- Deactivate confirmation/error handling
- Empty state when no categories exist

---

## 6. Notes

- The route also exists at `apps/web/src/routes/_authenticated/dashboard/_layout/service-category/view.tsx` — that duplicate path is listed in `routeTree.gen.ts`; both appear to render identical logic.
- `requirePermission` in `beforeLoad` is currently a stub (`route-guards.ts`) and does not actually block navigation.
- The `isActive: undefined` passed to `list` means no filter — all categories (active and inactive) are returned.
- Deactivation is soft-delete only; categories cannot be hard-deleted from the UI.
