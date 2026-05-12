# My Services

**Route:** `/dashboard/my-services/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View and manage personal service assignments and buffer time overrides per service.

**Produces:** Table of assigned services with category, default buffer time, and personal override; edit sheet for each row.

**On success:**  
- List: shows all services assigned to user with buffer times
- Edit: opens sheet, allows setting override minutes or clearing to use default
- Save: override applied; query invalidated; sheet closes; toast confirms

**On failure / error states:**  
- No org: guard message "Select an organization..."
- Loading: spinner
- Error: error message with refresh suggestion
- Form validation: toast error if invalid number entered

---

## 2. How It Works

**Execution flow:**  
1. Page guards: checks org, loads user context
2. Query `client.serviceMembers.listMine({ organizationId })`
3. Renders table: Service name (+ category subtext), Category Default buffer, My Override badge, Edit button
4. Click Edit → opens Sheet
5. Sheet shows: service name (read-only), category (if exists, read-only), buffer input
6. User can: enter minutes, leave blank (use default), or clear override
7. Mutation `client.serviceMembers.updateMyBuffer({ organizationId, serviceId, bufferTimeMinutes })`
8. On success: query refetch; sheet closes; toast "Buffer time updated."

**Inputs:**  
- Buffer input in sheet: number (minutes) or blank
- Clear Override button (if override exists)

**State management:**  
- TanStack Query: `["myServices", organizationId]`
- Local state: sheetOpen, selectedService, bufferInput

**Outputs:**  
- Table of service assignments
- Edit sheet overlay
- Toast notification

**Side effects:**  
- Query invalidation on save
- Sheet close on success
- Form reset on cancel

---

## 3. What Depends On It

**Calls these API endpoints:**  
- `client.serviceMembers.listMine({ organizationId })` — fetch assigned services
- `client.serviceMembers.updateMyBuffer({ organizationId, serviceId, bufferTimeMinutes? })` — save override (null to clear)

**Uses these components:**  
- `DataTable<ServiceBufferAssignment>` — `src/components/tables/sales/view/data-table` — table rendering
- `EmptyState` — displayed when no services assigned
- `Sheet`, Button, Badge, Input, Label, Separator (shadcn/ui)

**Uses these hooks:**  
- `useUserContext()` — org ID
- `useQuery()` — fetch services
- `useMutation()` — update buffer
- `useQueryClient()` — invalidation

**Navigation: who navigates here:**  
- Dashboard sidebar link

**Navigation: where it goes:** None (internal sheet only)

---

## 4. Data Shapes

**DB tables touched:**  
- `service_members` (read/write) — service assignments + buffer overrides
- `services` (read) — service names
- `service_categories` (read) — category names and default buffers

**Key types / Zod schemas:**  
```tsx
type ServiceBufferAssignment = {
  serviceId: string;
  serviceName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryDefaultBuffer: number;
  bufferTimeMinutes: number | null;
};
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**  
- Form validation (numeric input, empty vs. zero)
- Clear Override button interaction
- Sheet open/close lifecycle
- Query refetch on org change
- Null vs. 0 buffer time distinction
- Error message display on failed update

---

## 6. Notes

- **Buffer logic**: `categoryDefaultBuffer` is read from category config; `bufferTimeMinutes` is personal override. If override is null, category default is used.
- **Input validation**: Parsing via `parseInt(bufferInput, 10)`; NaN check shows toast error
- **Clear Override button**: Only shown if `bufferTimeMinutes != null`; calls save with `bufferTimeMinutes: null` to reset
- **Empty default**: Leaving input blank is treated as `null` override (use category default)
- **Naming**: "My Override" column indicates personal customization per service
- **Category display**: Shows category name as subtext under service name in table

