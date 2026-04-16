# Service View

**Route:** `/_authenticated/service/view`
**File:** `apps/web/src/routes/_authenticated/service/view.tsx:1`
**Platform:** web
**Auth required:** rbac(service_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Displays all services offered by the organization in a sortable, searchable table, with inline add, edit, and deactivate (soft-delete) capabilities.

**Produces:** A table of services enriched with their category name, a global search input, an "Add Service" button, and row-click detail dialogs.

**On success:** Table renders with all active and inactive services; clicking a row opens a detail dialog; clicking "Add Service" opens a creation form.
**On failure / error states:**
- No organization selected → "No organization selected. Please select an organization first."
- API error → displays `error.message` in destructive text.
- Loading (either services or categories) → "Loading..." centered in table area.
- Empty table → "No services yet. Add one to get started." empty row.

---

## 2. How It Works

**Execution flow:**
```
ServiceViewComponent
  → useUserContext() — get organizationId
  → useQuery(["service-categories", orgId])
      → client.serviceCategories.list({ organizationId })
          → POST /rpc/serviceCategories/list
  → useQuery(["services", orgId])
      → client.services.list({ organizationId, isActive: undefined })
          → POST /rpc/services/list
          → requirePermission(tenantDb, member, "service_management", "read")
          → listServices(tenantDb, { accessibleNodeIds })
  → useMemo: build categoryNameMap (id → name)
  → useMemo: merge services with service_category_name
  → <DataTable> with enriched services
      → row click → ServiceDetailDialog
      → "Add Service" → ServiceFormDialog (create mode)
      → edit action → ServiceFormDialog (edit mode)
          → client.services.getById → prefill form
      → delete action → client.services.update({ isActive: false }) — soft delete
```

**Inputs:**
- No URL params or query params.
- `organizationId` from `useUserContext()`.
- `isActive: undefined` passed to `services.list` — returns both active and inactive.

**State management:** TanStack Query cache (services: `staleTime: 30s`, categories: `staleTime: 60s`). All table state (dialogs, selected IDs, search) is local inside `DataTable`.

**Outputs:** `<DataTable>` with columns, Add/Edit/Detail dialogs.

**Side effects:**
- Deactivating a service calls `client.services.update({ isActive: false })` — soft delete.
- `onSuccess` callback triggers `refetch()` on the services query.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceCategories.list` — `POST /rpc/serviceCategories/list` — fetch categories for name resolution
- `services.list` — `POST /rpc/services/list` — fetch all services in scope
- `services.getById` — `POST /rpc/services/getById` — fetch single service for edit prefill (inside DataTable)
- `services.update` — `POST /rpc/services/update` — soft-delete (isActive: false)

**Uses these components:**
- `DataTable` — `@/components/tables/service/view/data-table.tsx` — table UI with search, sorting, and dialogs
- `columns` — `@/components/tables/service/view/columns` — column definitions
- `ServiceFormDialog` — `@/components/forms/service-form` — create/edit service form (inside DataTable)
- `ServiceDetailDialog` — `@/components/forms/service-detail-dialog.tsx` — service detail view (inside DataTable)

**Uses these hooks:**
- `useUserContext` — `@/hooks/useUserContext` — provides `organizationId`
- `useQuery` (×2) — service categories, services list
- `useMemo` (×2) — category name map, enriched services array

**Navigation: who navigates here:**
- `apps/web/src/components/app-sidebar.tsx:123` — "View Services" sidebar link under Services section (`/dashboard/service/view` is the dashboard-nested version; this is the standalone route)

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `services` | SELECT, UPDATE | `id`, `name`, `category_id`, `price`, `is_active`, `taxable`, `tax_percentage`, `session_count`, `expirable`, `scheduling_type`, `duration`, `duration_unit_type`, `max_attendees`, `branch_id` |
| `service_categories` | SELECT | `id`, `name` |

**Key type (enriched service row):**
```typescript
{
  // all fields from services.list return value
  service_category_name: string | null; // joined client-side from categories
}
```

**DataTable `editInitialData` mapping:**
```typescript
{
  id: number;                  // cast from UUID string (lossy — always 0 if not parseable)
  name: string;
  duration: 1;                 // hardcoded placeholder
  duration_unit: "minutes";    // hardcoded placeholder
  expirable: boolean;
  price: number;               // cents ÷ 100 → display RM
  sessions: number;            // sessionCount ?? 1
  taxable: boolean;
  tax_percentage: number;
  category_id: string;
  schedulingType: "appointment-based" | "time-preset";
  sessionDurationMinutes: number;
  maxAttendees: number;
}
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/service.test.ts` (referenced in git status as new file — content not read).
**Scenarios covered:** Unit tests for service service layer (not the route component itself).
**Not tested (risk areas):**
- `id: Number(editServiceData.id) || 0` — casting UUID string to number always yields `0`; if `ServiceFormDialog` relies on `id` for edit operations this is a bug.
- `isActive: undefined` fetches both active and inactive services — UI shows no visual distinction between active and inactive rows (no status badge in the service table).
- Category name resolution is client-side join — if a category is deleted, the service row shows `null` category name silently.

---

## 6. Notes

- This standalone `/service/view` route coexists with the dashboard-nested `/_authenticated/dashboard/_layout/service/view` route; the sidebar links to the dashboard-nested version.
- `isActive: undefined` is explicitly passed (not omitted) to ensure the query returns all services. If the intent is to show only active services, this should be `isActive: true`.
- The `id: Number(editServiceData.id) || 0` cast in `DataTable.editInitialData` is almost certainly wrong — UUIDs cannot be coerced to a meaningful number. This appears to be dead code if `ServiceFormDialog` uses the UUID string `editServiceId` passed separately.
- `staleTime` for services (30s) is shorter than categories (60s) — this is intentional as services change more frequently.
- `DataTable` receives both `categories` and `isLoading` props in the route component signature but the `DataTable` component definition only declares `columns`, `data`, `organizationId`, `isLoading`, `onSuccess` — the `categories` prop is silently ignored by the table component.
