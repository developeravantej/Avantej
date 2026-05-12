# Service View

**Route:** `/_authenticated/service/view`
**File:** `apps/web/src/routes/_authenticated/service/view.tsx:1`
**Platform:** web
**Auth required:** rbac(service_management:read)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Displays a searchable, sortable table of all services in the organization with full CRUD operations. Enriches each service row with its category name.
**Produces:** A table showing service name, category, price, scheduling type, status, and actions. Supports Add, Edit, Detail, and soft-Delete flows via modals.
**On success:** Both services and categories load; category names are joined client-side into `service_category_name` on each row.
**On failure / error states:** Loading spinner while either query is pending. Inline error message if services query fails. "No organization selected" if `currentOrganizationId` is null.

---

## 2. How It Works

**Execution flow:**
```
ServiceViewComponent
  → useUserContext() → currentOrganizationId
  → useQuery(["service-categories", orgId]) stale: 60s
    → client.serviceCategories.list({ organizationId })
      → serviceCategoriesRouter.list → tenant DB: service_categories
  → useQuery(["services", orgId]) stale: 30s
    → client.services.list({ organizationId, isActive: undefined })
      → servicesRouter.list
        → requirePermission(tenantDb, member, "service_management", "read")
        → listServices(tenantDb, { accessibleNodeIds })
          → tenant DB: services table
  → useMemo: build categoryNameMap (id → name)
  → useMemo: map services → add service_category_name field
  → <DataTable>
    → On row click: <ServiceDetailDialog>
    → "Add" button: <ServiceFormDialog mode="create">
    → Edit action: useQuery(["service", "edit", id]) → client.services.getById
      → <ServiceFormDialog mode="edit" initialData={...}>
    → Delete action: client.services.update({ isActive: false })
```

**Inputs:** None (no URL params or query params)
**State management:**
- TanStack Query: `["service-categories", orgId]` (60s stale), `["services", orgId]` (30s stale)
- DataTable local state: `globalFilter`, `isAddDialogOpen`, `isEditDialogOpen`, `isDetailDialogOpen`, `selectedServiceId`, `editServiceId`
- Edit data fetched on demand: `["service", "edit", id, orgId]`

**Outputs:** Rendered table with joined data; create/edit/deactivate mutations; toast notifications
**Side effects:** `client.services.update({ isActive: false })` on delete; toast success/error

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceCategories.list` — populate category name lookup map
- `services.list` — fetch all services for org (respects RBAC hierarchy)
- `services.getById` — fetch service detail for edit pre-fill
- `services.update` — soft-delete (isActive: false) and edit save
- `services.create` — via ServiceFormDialog

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/service/view/data-table.tsx` — table shell with Add button, search, sort, row click
- `ServiceFormDialog` — `apps/web/src/components/forms/service-form.tsx` — create/edit modal
- `ServiceDetailDialog` — `apps/web/src/components/forms/service-detail-dialog.tsx` — detail view modal with edit/delete triggers

**Uses these hooks:**
- `useUserContext` — retrieves `currentOrganizationId`
- `useQuery` — data fetching
- `useMemo` — builds categoryNameMap and enriched service list

**Navigation: who navigates here:**
- App sidebar: "View Services" under Services group → `/dashboard/service/view` (points to dashboard twin)
- `requirePermission` guard in `beforeLoad` redirects to `/dashboard` if absent

**Navigation: where it goes:** Stays on page; all interactions open dialogs in-place

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `service_categories` | SELECT | `id`, `name` |
| `services` | SELECT, UPDATE | `id`, `name`, `categoryId`, `price`, `schedulingType`, `isActive`, `branchId`, `durationUnitType`, `duration`, `sessionCount`, `expirable`, `expiryDays`, `taxable`, `taxPercentage`, `availablePaymentPlans`, `installmentIntervalDays`, `maxAttendees` |

**Key types / Zod schemas:**
- `services.list` input: `{ organizationId: uuid, categoryId?: uuid|null, branchId?: uuid|null, isActive?: boolean, type?: "private"|"semi_private"|"both", schedulingType?: "appointment"|"class_slot" }`
- Edit pre-fill: converts `expiryDays` to `(duration, duration_unit)` display units; converts price from integer cents to display decimal; maps `class_slot` schedulingType to `"time-preset"`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Category name enrichment when category is deleted (returns `null` gracefully); RBAC redirect stub; price/duration unit conversion in edit pre-fill

---

## 6. Notes

- Price is stored as integer cents in DB; edit pre-fill converts `price / 100` to display value.
- `expiryDays` is converted to human-friendly `(duration, unit)` pairs: years if divisible by 365, months by 30, weeks by 7, else raw days.
- Duplicate route exists: `/_authenticated/dashboard/_layout/service/view` — sidebar points there. This standalone version is an alternate entry point.
- Services are RBAC-scoped: non-admin users only see services within their accessible hierarchy nodes.
- Soft-delete only: no hard delete available from this UI.
