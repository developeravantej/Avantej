# Service View

**Route:** `/dashboard/service/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Browse, create, edit, and deactivate services offered by the organization (e.g., personal training sessions, group classes). This is also where session-based "packages" are created and managed — the standalone Packages page was removed; all package fields (sessionCount, expiryDays, availablePaymentPlans, installmentIntervalDays) are set via the Service form.
**Produces:** A searchable table of services with name, category, duration, price, scheduling type, status, and creation date; "Add Service" and per-row edit/detail/delete actions via dialogs.
**On success:**
- Create: `ServiceFormDialog` closes; `queryClient.invalidateQueries(["services", organizationId])` triggered via `onSuccess()`.
- Edit: same invalidation.
- Deactivate (soft delete via update `isActive: false`): toast "Service deactivated"; `onSuccess()` called.
**On failure / error states:**
- No organization: "Select an organization to view services."
- Loading: centered spinner (combined `servicesLoading || categoriesLoading`).
- DataTable empty state: "No services yet. Add one to get started."

---

## 2. How It Works

**Execution flow:**
```
ServiceViewPage
  → useUserContext() → organizationId
  → useQuery(["services", organizationId])
      → client.services.list({ organizationId })
        → servicesRouter.list → requirePermission("service_management", "read")
        → getDescendantNodeIds(tenantDb, member.hierarchyScopeId) → accessibleNodeIds
        → listServices(tenantDb, { accessibleNodeIds, ... })
  → useQuery(["serviceCategories", organizationId])
      → client.serviceCategories.list({ organizationId })
  → passes services, categories, organizationId, onSuccess() to DataTable
  → DataTable internally:
      → "Add Service" → ServiceFormDialog (mode="create")
          → client.services.create(...)  [servicesRouter.create → requirePermission("service_management", "create")]
      → Row click → ServiceDetailDialog (view detail)
      → Row edit → ServiceFormDialog (mode="edit") pre-filled via client.services.getById(...)
      → Row delete → client.services.update({ isActive: false })
          [servicesRouter.update → requirePermission("service_management", "update")]
```

**Inputs:** No URL params or filters — all active services for the org/scope are fetched. Form fields in `ServiceFormDialog`: name, duration, duration unit, expirable, price, sessions, taxable, tax %, category, session count (`sessionCount`), expirable + expiry duration (`expiryDays`), available payment plans (`availablePaymentPlans`: `string[]` of codes fetched dynamically via `client.installmentPlans.list({ activeOnly: true })` — no longer hardcoded to full/half/quarterly; `isInstallmentSelected` derived from `plansMap.get(code)?.numInstallments > 1`), installment interval (`installmentIntervalDays`), scheduling type, session duration, max attendees.
**State management:** TanStack Query cache; local state in `DataTable` (dialogs, selected IDs, global filter string).
**Outputs:** Table with columns: Name, Category, Duration, Price (MYR, formatted as "RM X.XX"), Sessions, Scheduling type badge, Status badge, Created date.
**Side effects:** `queryClient.invalidateQueries(["services", organizationId])` on create/edit/deactivate.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `services.list` — list services in accessible scope; requires `service_management:read`.
- `services.getById` — fetch single service for edit pre-fill; requires `service_management:read`.
- `services.create` — create new service; requires `service_management:create`.
- `services.update` — update service fields or deactivate; requires `service_management:update`.
- `serviceCategories.list` — list categories for form dropdown.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/service/view/data-table.tsx` — table with embedded add/edit/detail/delete.
- `columns` — `apps/web/src/components/tables/service/view/columns.tsx` — column definitions: Name, Category, Duration, Price, Sessions, Scheduling, Status, Created. Typed as `ColumnDef<any>`. Imports `formatPrice` from `@/lib/currency`.
- `ServiceFormDialog` — `apps/web/src/components/forms/service-form.tsx` — create/edit form dialog.
- `ServiceDetailDialog` — `apps/web/src/components/forms/service-detail-dialog.tsx` — read-only detail sheet.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `useQuery` (two queries), `useQueryClient`.
- `useQuery` inside `DataTable` for `services.getById` when editing.

**Navigation: who navigates here:**
- Sidebar "Business → Services → View Services" link (`apps/web/src/components/app-sidebar.tsx:123`).

**Navigation: where it goes:** No outbound navigation (all actions open dialogs in-page).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `services` | SELECT / INSERT / UPDATE | `id`, `name`, `categoryId`, `duration`, `durationUnitType`, `maxAttendees`, `attendanceThreshold`, `branchId`, `isActive`, `title`, `description`, `imageUrl`, `type`, `price`, `priceUnit`, `taxable`, `taxPercentage`, `isRecommended`, `location`, `features`, `schedulingType`, `sessionCount`, `expirable`, `expiryDays`, `expiryDate`, `availablePaymentPlans`, `installmentIntervalDays` |
| `service_categories` | SELECT | `id`, `name` |
| `hierarchy_nodes` | SELECT (via getDescendantNodeIds) | `id`, `parentId` |

**Key types:**
```typescript
// service returned from API (partial shape used in table)
{
  id: string; name: string; categoryId?: string | null;
  duration: number; durationUnitType?: string | null;
  maxAttendees: number; branchId?: string | null;
  isActive: boolean; price?: number | null; // cents
  schedulingType?: "appointment" | "class_slot" | null;
  sessionCount?: number | null; expirable?: boolean; taxable?: boolean;
  taxPercentage?: number | null; createdAt: Date | string;
}
// Categories passed to DataTable as { id: string; name: string }[]
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/service.test.ts` — service-layer unit tests for `listServices`, `getServiceById`, `createService`, `updateService`.
**Scenarios covered:** Service CRUD at the service layer with mock DB.
**Not tested:** Frontend dialogs, DataTable row interactions, deactivation flow, category dropdown population.

---

## 6. Notes

- ~~USD currency bug~~ **FIXED (2026-04-16):** The local `formatPrice` function (which formatted in USD) was removed from `columns.tsx` and replaced with the shared `formatPrice` from `@/lib/currency`. Prices now display correctly as "RM X.XX" via `formatPrice(val, "MYR")`.
- Deactivation is implemented as a soft delete via `services.update({ isActive: false })` — there is no dedicated delete endpoint.
- Duration stored in DB in seconds but `durationUnitType` controls display unit. The edit form converts to minutes for display.
- `services.create` and `services.update` both accept all package fields (`sessionCount`, `expirable`, `expiryDays`, `expiryDate`, `availablePaymentPlans`, `installmentIntervalDays`). A service with `sessionCount > 0` is treated as a session-based package by the native purchase flow.
- `DataTable` is typed as `DataTable<TData, TValue>` but the service data is passed as `ColumnDef<any>` — type safety is not enforced at the column level.
- The `categories` prop passed to `DataTable` is `{ id, name }[]` — only these two fields are available in the form; the full category objects from the API are stripped.
