# Services Tab — White-Box QA Map

**Route:** `/_authenticated/dashboard/_layout/service/view?tab=services`
**Route file:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`
**Component:** `apps/web/src/components/pages/services/services-page.tsx`
**API:** `packages/api/src/routers/services/crud.procedures.ts` + `pricing.procedures.ts` + `analytics.procedures.ts`
**Service layer:** `packages/services/src/service.service.ts`
**Date audited:** 2026-05-25

---

## 1. Interactive Elements

### Route-level tab bar (view.tsx:67-84)

| Element | Type | Effect |
|---------|------|--------|
| Services pill | `<button>` | `navigate({ search: { tab: "services" } })` — shows `<ServicesPage>` |
| Categories pill | `<button>` | `navigate({ search: { tab: "categories" } })` |
| Rooms pill | `<button>` | `navigate({ search: { tab: "rooms" } })` |
| Promotions pill | `<button>` | `navigate({ search: { tab: "promotions" } })` |
| Pricing pill | `<button>` | `navigate({ search: { tab: "pricing" } })` |
| Installment Plans pill | `<button>` | `navigate({ search: { tab: "installments" } })` |

`validateSearch` coerces any unknown `tab` value → `"services"` (view.tsx:16-18).

### ServicesPage toolbar (services-page.tsx:459-498)

| Element | Type | Effect |
|---------|------|--------|
| Search input | `<input type="text">` | Client-side filter by `name` or `service_category_name`; resets `page` to 1 |
| Category pills ("All", per-category) | `<button>` | Client-side category filter; resets `page` to 1 |
| "New Service" button | `<button>` | `setIsAddOpen(true)` → opens `ServiceFormDialogA` in `create` mode |

### ServicesPage table (services-page.tsx:534-775)

| Element | Type | Effect |
|---------|------|--------|
| Header checkbox | `<input type="checkbox">` (tri-state) | Select/deselect all items on current page |
| Row checkbox | `<input type="checkbox">` | Toggle row in `selected` Set |
| Row click (any non-action cell) | `<tr onClick>` | `setDetailServiceId(id)` + `setIsDetailOpen(true)` → opens `ServiceDetailDialogA` |
| Sort headers (Service, Duration, Price, Avg/mo) | `<th onClick>` | Sets `sortKey`/`sortDir`; resets page to 1 |
| Active toggle | `<input type="checkbox">` (switch) | `client.services.update({ isActive: checked })` → toast + invalidate |
| Edit button (hover) | `<button>` | `setEditServiceId(id)` + `setIsEditOpen(true)` → opens `ServiceFormDialogA` in `edit` mode |
| Dupe button (hover) | `<button disabled={duplicateMutation.isPending}` | `client.services.duplicate({ id })` → toast + invalidate |
| Prev/Next pagination | `<button>` | `setPage(p ± 1)` |
| Page number buttons | `<button>` | `setPage(n)` |

### Bulk action bar (services-page.tsx:502-530, shown when `selected.size > 0`)

| Element | Type | Effect |
|---------|------|--------|
| "Enable selected" | `<button>` | `Promise.allSettled` of `client.services.update({ isActive: true })` for each ID → toast + clear selection + invalidate |
| "Disable selected" | `<button>` | Same, `isActive: false` |
| "Clear" | `<button>` | `setSelected(new Set())` |

### ServiceFormDialogA (service-form-a.tsx) — Create / Edit modal

| Element | Type | Validation |
|---------|------|-----------|
| Service Name | `<input type="text">` | Client: `z.string().min(1)`, max 200; required marker shown |
| Category select | `<select>` | Client: `z.string().uuid("Category is required")`; disabled while loading |
| Session Duration (min) | `<input type="number" min=1>` | Client: `z.number().int().min(1)` |
| Max Attendees | `<input type="number" min=1>` | Client: `z.number().int().min(1)` |
| Scheduling type (radio) | 2 radios | `appointment-based` or `time-preset`; discriminated union validation |
| TimePresetEditor | Complex sub-component | Requires ≥1 recurring day + ≥1 time slot per day |
| Price (RM) | `<input type="number" min=0 step=0.01>` | Client: `z.number().min(0).transform(rmToCents)` |
| Sessions | `<input type="number" min=0>` | Client: `z.number().int().min(0)` |
| Taxable | `<input type="checkbox">` | boolean |
| Tax % | `<input type="number" min=0 max=100>` (shown if taxable) | Client: `z.number().int().min(0).max(100)` |
| Expirable | `<input type="checkbox">` | boolean |
| Duration + unit (shown if expirable) | number + select | Client: `z.number().int().min(1)` |
| Payment plan checkboxes | list of `<input type="checkbox">` | none individually |
| Installment interval (days) | `<input type="number" min=1>` (shown if installment plan selected) | Client: `z.number().int().min(1)` |
| Grace period (days) | `<input type="number" min=0 max=90>` (shown if installment plan) | Client: `z.number().int().min(0).max(90)` |
| Cancel | `<button type="button">` | `onClose()` |
| Add Service / Save Changes | `<button type="submit">` | Triggers Zod parse then mutation |

**Submit path (create):** `serviceFormSchema.parse(value)` → `client.services.create(...)` → `useApiMutation` toast "Service created successfully" + `invalidate([orpc.services.list.key()])` + `onClose()`.

**Submit path (edit):** Same but `client.services.update({ ...commonFields, id: initialData.id })`.

**Edit data loading:** `useQuery` keyed `["service", "edit", editServiceId, organizationId]` with `enabled: !!editServiceId && !!organizationId && isEditOpen`; `editInitialData` derives display units from raw DB data (services-page.tsx:251-289).

### ServiceDetailDialogA (service-detail-dialog-a.tsx) — Read-only + deactivate

| Element | Type | Effect |
|---------|------|--------|
| Edit button (header) | `<button>` | `onClose()` then `onEdit(serviceId)` — opens edit form |
| Deactivate button (header) | `<button>` | `setShowDeleteConfirm(true)` |
| Deactivate confirmation → Deactivate | `<button>` | Calls `onDelete(serviceId)` → `client.services.update({ isActive: false })` → toast "Service deactivated" + invalidate |
| Deactivate confirmation → Cancel | `<button>` | `setShowDeleteConfirm(false)` |
| Close (footer) | `<button>` | `onClose()` |

**Data loading:** `useEffect` + imperative `client.services.getById(...)` when `isOpen && serviceId && organizationId` — NOT TanStack Query, so not cache-aware (service-detail-dialog-a.tsx:138-163).

---

## 2. User Journeys

### J-1: Golden — Create a new service
1. Land on `/dashboard/service/view?tab=services`
2. Click "New Service" → ServiceFormDialogA opens (create mode)
3. Fill: Name, Category (required UUID), Duration, Max Attendees, Scheduling type, Price, Sessions
4. Submit → `services.create` → toast "Service created successfully" → dialog closes → list refetches
5. New service row appears in table

### J-2: Golden — Edit an existing service
1. Hover service row → click "Edit"
2. `useQuery(["service","edit",id,orgId])` fires, `editInitialData` derived
3. Form populates with converted data (cents→RM, seconds→minutes, expiryDays→duration+unit)
4. User changes fields → submit → `services.update` → toast "Service updated successfully" → dialog closes → list refetches

### J-3: Golden — View service details
1. Click anywhere on a row (not checkbox/toggle/action buttons)
2. `client.services.getById` imperative call, loading spinner shown
3. Two-column dialog renders: Overview (status, type, recommended), Scheduling (type, duration, max attendees), Pricing (price, taxable, sessions, expiry), Timestamps

### J-4: Golden — Deactivate from detail dialog
1. Open detail dialog → click "Deactivate"
2. Confirm dialog → "Deactivate" button → `client.services.update({ isActive: false })` → toast "Service deactivated" → confirm dialog closes + detail dialog closes → list refetches

### J-5: Golden — Toggle active inline
1. Click toggle switch in Active column (stopPropagation prevents row detail opening)
2. `client.services.update({ isActive: !current })` → toast "Service activated" or "Service deactivated" → `invalidate`

### J-6: Golden — Duplicate a service
1. Hover row → click "Dupe"
2. `client.services.duplicate({ id })` → service layer creates `name + " (Copy)"` with `isActive: false`
3. Toast "Service duplicated (inactive draft created)" → list refetches

### J-7: Golden — Bulk enable/disable
1. Check ≥1 row checkboxes → bulk bar appears
2. "Enable selected" / "Disable selected" → `Promise.allSettled` for each ID
3. Toast + clear selection + invalidate list

### J-8: Search + Category Filter
1. Type in search → client-side filter against `name` + `service_category_name`, page resets to 1
2. Click category pill → additional client-side filter

### J-9: Pagination
1. Next/Prev buttons, page number pills, 15 items per page (`PAGE_SIZE = 15`)

### J-10 (Alternate): Create with time-preset scheduling
1. Select "Time-preset" radio → TimePresetEditor appears
2. Toggle recurring days → add time slots → submit
3. `timePresetConfig` sent to `services.create` with `schedulingType: "class_slot"`

### J-11 (Alternate): Create with expiry
1. Check "Expirable" → duration + unit appear
2. Duration × unit → `toExpiryDays(duration, unit)` → `expiryDays` on wire

### J-12 (Alternate): Create with installment plans
1. Check a plan whose `numInstallments > 1` → installment interval + grace period fields appear
2. Grace period blank → sent as `null` (server default = 7 days)

---

## 3. Data States

| State | Handler | Component |
|-------|---------|-----------|
| No organizationId | "Select an organization to view services." guard (services-page.tsx:423-429) | ServicesPage |
| Loading services | `<PageLoader />` (services-page.tsx:431) | ServicesPage |
| Empty list (no filter) | "No services yet. Create your first one." (services-page.tsx:595-598) | Table empty row |
| Empty after filter | "No services match this filter." | Table empty row |
| Detail dialog: loading | Centered spinner + "Loading…" (service-detail-dialog-a.tsx:235-239) | ServiceDetailDialogA |
| Detail dialog: error | `<StatusCallout variant="error">` with message (service-detail-dialog-a.tsx:243-246) | ServiceDetailDialogA |
| Categories loading in form | "Loading categories..." option + disabled select (service-form-a.tsx:459,461) | ServiceFormDialogA |
| No installment plans | "No payment plans configured…" message (service-form-a.tsx:859-861) | ServiceFormDialogA |
| Active toggle pending | `pending` state disables checkbox (service-form-a.tsx:107-109) | ActiveToggle |
| Dupe pending | `duplicateMutation.isPending` disables Dupe button (services-page.tsx:719) | ServicesPage |
| Bulk action | No loading state shown during `Promise.allSettled` | BulkBar — **UNHANDLED: partial failures silently ignored** |
| Edit data loading | No explicit loading shown to user during `useQuery(["service","edit",...])` | ServicesPage — **UNHANDLED** |

**Unhandled states:**
- `services.list` error state: query error not caught/displayed; user sees empty list as if no services exist
- `serviceCategories.list` error in form: select stays at "Select a category"; no error message shown
- Bulk action partial failure: `Promise.allSettled` means some IDs may fail silently; toast always shows success
- Edit form: if `editServiceData` fetch fails, `editInitialData` is `undefined`; form opens with blank defaults — no error shown to user
- Active toggle concurrent click: no debounce; rapid double-click could send two opposite requests

---

## 4. Per-Field Validation

### ServiceFormDialogA fields

| Field | Client guard (Zod) | Server guard (API) | Mismatch |
|-------|-------------------|-------------------|---------|
| name | `min(1)`, `max(200)` | `z.string().min(1)` (no max on server) | Server accepts names > 200 chars |
| categoryId | `z.string().uuid()` | `z.string().uuid().nullable().optional()` | Client requires it (UUID), server allows null/missing — form enforces stricter |
| sessionDurationMinutes | `int().min(1)` | `duration: z.number().int().min(1)` | Aligned |
| maxAttendees | `int().min(1)` | `int().min(0)` | Client requires ≥1, server allows 0 |
| price | `z.number().min(0).transform(rmToCents)` | `z.number().int().min(0).nullable()` | After transform, client sends integer ≥0; aligned |
| sessions | `int().min(0)` | `sessionCount: z.number().int().min(1).nullable()` | Server min=1 if non-null; client accepts 0, which is sent as `null` to server (sessions>0 check in mutation — service-form-a.tsx:259) |
| taxPercentage | `int().min(0).max(100)` | `int().min(0).max(100)` | Aligned |
| expiryDays (derived) | `int().min(1)` (via duration) | `int().min(1).nullable()` | Aligned |
| installmentIntervalDays | `int().min(1)` | `int().min(1)` | Aligned |
| gracePeriodDays | `int().min(0).max(90)` | `int().min(0).max(90)` | Aligned |
| schedulingType | discriminated union | `z.enum(["appointment","class_slot"])` | Client uses "appointment-based"/"time-preset"; mapped to "appointment"/"class_slot" on wire |
| timePresetConfig (time-preset) | `recurringDays.min(1)` | server-side schema: `recurringDays.min(1)` | Aligned; but **client uses `z.object` vs server's nullable schema** — server allows null for this field |
| availablePaymentPlans | array of strings | `z.array(z.string())` + `validateInstallmentPlanCodes` | Client shows only active plans; server independently validates each code exists and is active — **if plan is deactivated between form load and submit, server rejects with "Unknown installment plan: {code}"** |

### Deactivation (via update)

| Field | Client guard | Server guard |
|-------|-------------|-------------|
| isActive=false | No confirmation on toggle; confirmation dialog only in detail view | No special guard; just `requirePermissionOrpc("service_management","update")` |

---

## 5. State Transitions / Side Effects

| Action | Mutation | Cache invalidation | Toast |
|--------|----------|-------------------|-------|
| Create service | `client.services.create(...)` | `orpc.services.list.key()` | "Service created successfully" |
| Edit service | `client.services.update(...)` | `orpc.services.list.key()` | "Service updated successfully" |
| Toggle active (inline) | `client.services.update({ isActive })` | `orpc.services.list.key()` | "Service activated" / "Service deactivated" |
| Deactivate (from detail) | `client.services.update({ isActive: false })` | `orpc.services.list.key()` | "Service deactivated" |
| Duplicate | `client.services.duplicate({ id })` | `orpc.services.list.key()` | "Service duplicated (inactive draft created)" |
| Bulk enable/disable | `client.services.update(...)` × N | `orpc.services.list.key()` | "Selected services enabled/disabled" (always, even on partial failure) |

**Note:** `onToggled` in `ActiveToggle` calls `qc.invalidateQueries({ queryKey: orpc.services.list.key() })` directly. The service form uses `useApiMutation`'s `invalidate` prop with the same key. These use different code paths but the same ultimate query key.

**Discrepancy:** The detail dialog fetches via an imperative `useEffect` + direct `client.services.getById()` call. When the edit form saves, the list is invalidated but the detail dialog's in-memory `service` state is NOT updated — user must close and reopen the detail dialog to see edited values.

---

## 6. RBAC / Permission Branches

### Route-level guard (view.tsx:13-15)
```
beforeLoad: requirePermission("service_management:read")
```
- Fetches user context from TanStack Query cache (stale time 5 min)
- System admins bypass all checks
- Redirects to `/dashboard?unauthorized=true` if missing

### API procedure guards

| Procedure | Permission check | Client role bypass |
|-----------|-----------------|-------------------|
| `services.list` | `service_management:read` | Skipped for `role === "client"` |
| `services.getById` | `service_management:read` | Skipped for `role === "client"` |
| `services.create` | `service_management:create` | None (always enforced) |
| `services.update` | `service_management:update` | None (always enforced) |
| `services.duplicate` | `service_management:create` | None |
| `services.listPriceOverrides` | `service_management:read` | Skipped for `role === "client"` |
| `services.setBranchPrice` | `service_management:update` | None |
| `services.expireBranchPrice` | `service_management:update` | None |
| `services.deleteBranchPrice` | `service_management:delete` | None |
| `serviceMembers.listForService` | `user_management:read` OR `service_management:read` OR `appointment_management:read` | None |
| `serviceMembers.assign` | `user_management:update` OR `service_management:update` | None |
| `serviceMembers.remove` | `user_management:update` OR `service_management:update` | None |

**Branch scope guard:** `guardInputBranchForContext` enforces that a non-null `branchId` is within the member's accessible hierarchy nodes. Applied in `create`, `update`, `getById` (guards service's existing branchId), and price procedures.

**UI-side RBAC:** The ServicesPage does NOT conditionally hide the "New Service" button, action buttons, or toggles based on permissions. A user with only `service_management:read` can see and click these buttons; they will receive a server FORBIDDEN error that surfaces as a toast error.

---

## 7. Key Implementation Notes

- **Duration unit mismatch:** DB stores duration in seconds by default (`durationUnitType = "seconds"` default in service.service.ts:212). Form sends `durationUnitType: "minutes"` always (service-form-a.tsx:248). Edit data loading in services-page.tsx:278-283 converts DB duration to minutes based on `durationUnitType`. If a service was created with `durationUnitType: "seconds"` externally, the edit form converts `duration_seconds / 60` (rounded), potentially losing precision.

- **Price field:** Form collects price in RM (float), transforms via `rmToCents` (rounds to nearest cent). Table displays via `formatPrice(svc.price, "MYR")` where `svc.price` is the raw DB integer cents. This is correct.

- **Category filter derived from list data:** Category filter pills are built from `service_category_name` in the services list response (a join result in `listServices`). If a service's `categoryId` is set but the category was deleted, `service_category_name` will be `null` and that service won't appear in any category pill.

- **`dataTable` vs custom table:** The hub doc references a `DataTable` component and `columns.tsx`, but `services-page.tsx` uses a fully custom `<table>` with inline `<tbody>`/`<thead>` — not the generic `DataTable`. The hub doc is stale on this point.

- **Trainers tab mentioned in hub doc:** The hub doc describes a `TrainersTab` inside `ServiceDetailDialog`. The actual component in use (`ServiceDetailDialogA`) has NO trainers tab — it is a read-only two-column layout with no trainer assignment UI. The trainer assign/remove flows described in the hub doc are not present in the active component.

- **`serviceMembers.listForService` not called from services tab:** Confirmed by reading `ServiceDetailDialogA` — it does not call `serviceMembers.listForService`. This procedure exists in the API but is not exercised from this page's active dialog.

- **No hard delete:** `services.update({ isActive: false })` is the only removal mechanism. No `delete` procedure exists for services themselves.

- **`services.deleteBranchPrice`** requires `service_management:delete` (not `update` like expire). No UI presents this distinction to users.
