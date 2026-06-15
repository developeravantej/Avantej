# Categories Tab — Functional Map

**URL:** `/dashboard/service/view?tab=categories`
**Route file:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`
**Component:** `apps/web/src/components/pages/services/categories-page.tsx`
**API router:** `packages/api/src/routers/service-categories.ts`
**Service layer:** `packages/services/src/service-category.service.ts`

---

## 1. Route Guard

`beforeLoad` calls `requirePermission("service_management:read")`.

- Reads from TanStack Query cache (staleTime 5 min) or fetches `auth.userContext`.
- System admins bypass all checks.
- No `service_management:read` → redirects to `/dashboard?unauthorized=true`.
- NOTE: `requirePermission` in `route-guards.ts` is a REAL implementation (not a stub). The comment in MEMORY.md about it being a stub applies to a different `requirePermission` import in `route-guards.ts` used for `beforeLoad` hooks. The actual guard IS enforced.

---

## 2. Interactive Elements

### 2.1 Tab Pills (route-level)
| Element | Location | Action |
|---------|----------|--------|
| "Categories" tab pill | `view.tsx:73` | Calls `navigate({ search: { tab: "categories" } })` — shallow URL update, mounts `<ServiceCategoriesPage />` |
| Other tab pills (Services, Rooms, Promotions, Pricing, Installment Plans) | `view.tsx:73` | Navigate away from categories tab |

### 2.2 Search Input
| Element | Location | Action |
|---------|----------|--------|
| Search input (placeholder: "Search categories...") | `data-table.tsx:126–131` | Updates `globalFilter` state; TanStack Table `getFilteredRowModel` filters all columns client-side using `includesString` |

### 2.3 Add Category Button
| Element | Location | Action |
|---------|----------|--------|
| "Add Category" button (+ icon) | `data-table.tsx:133–140` | Sets `isAddDialogOpen = true`; mounts `<ServiceFormDialog mode="create">` |

### 2.4 Table Rows
| Element | Location | Action |
|---------|----------|--------|
| Entire row click | `data-table.tsx:172–180` | Extracts `row.original.id`, sets `selectedCategoryId` + `isDetailDialogOpen = true`; opens `<ServiceCategoryDetailDialog>` |
| "Commission Config" button (per row) | `data-table.tsx:194–208` | Stops event propagation; sets `commissionCategoryId`, `commissionCategoryName`, `isCommissionSheetOpen = true`; opens `<CategoryCommissionForm>` |

### 2.5 ServiceFormDialog — Create Mode
| Element | Location | Action |
|---------|----------|--------|
| "Service Category Name" text input | `service-category-form.tsx:199–217` | Controlled input; validated on submit (min 1, max 100 chars) |
| "Duration (minutes)" number input | `service-category-form.tsx:221–246` | Controlled; `valueAsNumber \|\| 0`; validated min 0 |
| "Maximum Attendees" number input | `service-category-form.tsx:248–276` | Optional; empty → `undefined`; validated min 1 if provided |
| "Require advance booking" checkbox | `service-category-rules-section.tsx:57–71` | Toggles `requireAdvanceBooking`; enables/disables minAdvanceHours input |
| "Enable cancellation window" checkbox | `service-category-rules-section.tsx:73–87` | Toggles `enableCancellationWindow`; enables/disables cancellationCutoffHours input |
| "Min advance booking (hours)" number input | `service-category-rules-section.tsx:91–111` | Disabled when `requireAdvanceBooking=false`; min 0 |
| "Cancellation cutoff (hours)" number input | `service-category-rules-section.tsx:113–135` | Disabled when `enableCancellationWindow=false`; min 0 |
| "Buffer Time (minutes)" number input | `service-category-rules-section.tsx:138–160` | min 0, max 480 |
| "Cancel" button | `service-category-form.tsx:296–299` | Calls `onClose()`; closes dialog without saving |
| "Create Service Category" submit button | `service-category-form.tsx:303–313` | Triggers `form.handleSubmit()`; disabled while `mutation.isPending` |
| Dialog backdrop / X button | `service-category-form.tsx:174` | `onOpenChange` fires `onClose()` when open→false |

### 2.6 ServiceFormDialog — Edit Mode
Same fields as create. Opened via `ServiceCategoryDetailDialog` "Edit" button.
- Prefilled from `editCategoryData` (fetched via `getById` + `serviceCategoryConfig.getByCategoryId`).
- `initialData` contains `id, name, duration, maxAttendees, rules.*`.
- On submit: calls `serviceCategories.update({ name })` only — `description`, `displayOrder`, `branchId`, `isActive` are NOT sent in edit.

### 2.7 ServiceCategoryDetailDialog
| Element | Location | Action |
|---------|----------|--------|
| "Edit" button (Pencil icon) | `service-category-detail-dialog.tsx:177–188` | Closes detail dialog, calls `onEdit(categoryId)` → opens edit dialog |
| "Deactivate" button (Trash2 icon) | `service-category-detail-dialog.tsx:190–200` | Sets `showDeleteConfirm = true`; opens confirmation dialog |
| Confirm "Deactivate" button | `service-category-detail-dialog.tsx:310–318` | Calls `handleDelete()` → `onDelete(categoryId)` → `client.serviceCategories.update({ isActive: false })` |
| Cancel (in confirm dialog) | `service-category-detail-dialog.tsx:303–308` | `setShowDeleteConfirm(false)` |
| "Close" button (footer) | `service-category-detail-dialog.tsx:280–282` | Calls `onClose()` |
| Dialog backdrop / X | `service-category-detail-dialog.tsx:167` | Fires `onClose()` |

### 2.8 CategoryCommissionForm
| Element | Location | Action |
|---------|----------|--------|
| "Fixed RM" / "Variable %" radio buttons | `category-commission-form.tsx:268–296` | Sets `paymentType`; changes `unitLabel` displayed next to rate inputs |
| Coach Slot label inputs | `category-commission-form.tsx:330–350` | Updates `slots[i].label` |
| Coach Slot weightage inputs (%) | `category-commission-form.tsx:335–352` | Updates `slots[i].weightageBasisPoints`; live total badge shows %; red if ≠ 100% |
| Remove Slot button (Trash2) | `category-commission-form.tsx:355–362` | Removes slot; re-indexes; disabled if only 1 slot |
| "Add Slot" button | `category-commission-form.tsx:368–371` | Appends new slot with 0% weightage |
| "Max Coaches per Session" number input | `category-commission-form.tsx:378–387` | Sets `maxCoaches`; min 1, max 10 (HTML attr only) |
| "Rate depends on attendee count" Switch | `category-commission-form.tsx:394–409` | Toggles `isConditional`; shows flat rates vs condition-based rates section |
| Flat rate inputs per trainer tier | `category-commission-form.tsx:418–441` | Sets `rates[tierId].amount` in RM/% |
| "Add Condition" button | `category-commission-form.tsx:448–451` | Appends new condition |
| Condition Operator Select | `category-commission-form.tsx:486–505` | Sets operator (lt/lte/gt/gte/eq/between) |
| Condition Threshold input | `category-commission-form.tsx:507–516` | Sets threshold value |
| Condition Max input (between only) | `category-commission-form.tsx:519–531` | Sets thresholdMax; only shown when operator = "between" |
| Condition Label input | `category-commission-form.tsx:534–540` | Optional label |
| Condition rate inputs per tier | `category-commission-form.tsx:549–573` | Sets per-condition rates |
| Remove Condition button | `category-commission-form.tsx:473–479` | Removes condition; re-indexes |
| "Save Config" button | `category-commission-form.tsx:591` | Calls `handleSubmit()`; validates totals; calls `categoryCommission.upsert` |
| "Cancel" button | `category-commission-form.tsx:588` | Calls `onOpenChange(false)` |

---

## 3. Data Flow / Journeys

### 3.1 Golden Path: View Categories List

1. User navigates to `/dashboard/service/view?tab=categories`
2. `beforeLoad` checks `service_management:read` — passes
3. `ServiceCategoriesPage` mounts; reads `userContext.currentOrganizationId`
4. `useQuery` fires `client.serviceCategories.list({ organizationId })` (enabled when organizationId exists)
5. Server: `tenantProcedure` → `assertOrgContextMatch` → if `member.role !== "client"` checks `service_management:read` → `resolveAccessibleNodeIds` → `listServiceCategories(tenantDb, { accessibleNodeIds })`
6. Service: queries `service_categories` ordered by `displayOrder ASC, createdAt ASC`; post-filters by `accessibleNodeIds` (if set, only rows where `branchId === null OR branchId in accessibleNodeIds`)
7. Response mapped to `{ id, name, description, displayOrder, branchId, isActive, createdAt, updatedAt }`
8. Table renders with columns: Name, Description, Order, Status (Active/Inactive badge), Created

### 3.2 Golden Path: Create Category

1. Click "Add Category" → `ServiceFormDialog` opens (mode="create")
2. Fill name (required), duration, optionally maxAttendees, booking rules
3. Submit → `form.handleSubmit()` → Zod validation passes
4. `mutation.mutateAsync(values)`:
   a. `client.serviceCategories.create({ organizationId, name, description: null, displayOrder: 0, isActive: true })`
   b. `client.serviceCategoryConfig.upsert({ organizationId, categoryId, defaultDuration, defaultMaxAttendees, requireAdvanceBooking, minAdvanceHours, enableCancellationWindow, cancellationCutoffHours, bufferTimeMinutes })`
5. On success: toast "Service category created", invalidates `orpc.serviceCategories.list.key()` + `orpc.serviceCategoryConfig.getByCategoryId.key()`, closes dialog
6. Table refetches and shows new row

### 3.3 Golden Path: Edit Category

1. Click table row → DetailDialog opens, fetches `getById` + `getByCategoryId`
2. Click "Edit" → DetailDialog closes, EditDialog opens with `editCategoryId` set
3. `data-table.tsx` useQuery fires `getById` + `serviceCategoryConfig.getByCategoryId` to populate `editInitialData`
4. `editInitialData` maps: `{ id, name, duration: config.defaultDuration ?? 60, maxAttendees: config.defaultMaxAttendees ?? undefined, rules: { ... } }`
5. Edit name and/or rules → Submit
6. `client.serviceCategories.update({ organizationId, id, name })` — ONLY name is sent
7. `client.serviceCategoryConfig.upsert(...)` — all config fields sent
8. On success: toast "Service category updated", invalidates list + getByCategoryId keys, closes dialog

### 3.4 Golden Path: Deactivate Category

1. Click table row → DetailDialog opens
2. Click "Deactivate" (Trash2) → Confirm dialog appears
3. Click "Deactivate" in confirm → `handleDelete()` called
4. `onDelete(categoryId)` in data-table → `client.serviceCategories.update({ organizationId, id: categoryId, isActive: false })`
5. Toast "Category deactivated"
6. `qc.invalidateQueries({ queryKey: orpc.serviceCategories.list.key() })`
7. Confirm dialog closes, detail dialog closes

### 3.5 Golden Path: Commission Config

1. Click "Commission Config" button in table row (stops propagation to row)
2. `CategoryCommissionForm` opens; loads `categoryCommission.getByCategory` and `trainerTiers.list`
3. Existing config prefills form; "Configured"/"No config yet" badge shown
4. User sets payment type, slot labels/weightages, max coaches, rates (flat or conditional)
5. Click "Save Config": validates total weightage = 100%, at least 1 rate/condition
6. `client.categoryCommission.upsert(payload)` — amounts converted with `rmToCents()`
7. Toast "Commission config saved", closes dialog

---

## 4. Data States

### Loading States
| State | Handled? | Implementation |
|-------|----------|----------------|
| `organizationId` not yet loaded | YES | Shows "Select an organization..." message |
| List fetching (`isLoading=true`) | YES | `<PageLoader />` rendered |
| Detail dialog loading | YES | `<LoadingSpinner size="lg">` |
| Commission config loading | YES | "Loading…" centered text |
| Mutation pending (create/edit) | YES | Submit button disabled, text changes to "Creating..." / "Saving..." |
| Deactivate pending | YES | Spinner in confirm button, buttons disabled |

### Empty States
| State | Handled? | Notes |
|-------|----------|-------|
| Empty list (no categories) | YES | `<EmptyState title="No results found">` rendered by data-table |
| Empty search results | YES | Same `<EmptyState>` with `context="search"` (action button hidden) |
| No trainer tiers in commission form | YES | "No active trainer tiers found." message |
| No conditions yet in conditional mode | YES | "No conditions yet. Add one above." |

### Error States
| State | Handled? | Implementation |
|-------|----------|----------------|
| List query error | NOT HANDLED | `useQuery` error state is never checked in `categories-page.tsx`; the component falls through to render `<DataTable data={[]}>`  — user sees empty table with "No results found", not an error |
| Detail dialog fetch error | PARTIAL | `error` state set, `<StatusCallout variant="error">` shown; but category/config still null so no content flashes briefly |
| Mutation error (create/edit) | YES | `useApiMutation` calls `toast.error(err.message)` |
| Deactivate error | YES | `toast.error(message)` in `handleDelete` catch |
| Commission config fetch error | NOT HANDLED | `getByCategory` errors cause `existingConfig` to be undefined — form renders with default state, badge says "No config yet", user may not realise config failed to load |
| Commission upsert error | YES | `useApiMutation` calls `toast.error(err.message)` |
| `serviceCategoryConfig.getByCategoryId` in edit mode | PARTIAL | `.catch(() => null)` in data-table edit fetch — silently treats missing config as null; `editInitialData` uses fallbacks (duration: 60, rules: all-false) |

---

## 5. Per-Field Validation

### ServiceFormDialog Fields

| Field | Client-side | Server-side | Mismatch? |
|-------|-------------|-------------|-----------|
| name | Zod min(1), max(100) | API `z.string().min(1)` | SERVER has no max(100) guard — a name > 100 chars passes API, DB column is `text` (unlimited) |
| duration | Zod min(0), number | API `defaultDuration: z.number().int().min(1)` | MISMATCH: client allows 0 (min(0)), server rejects 0 (min(1) for defaultDuration) — a duration of 0 will fail at the `serviceCategoryConfig.upsert` step with a BAD_REQUEST, but the category CREATE already succeeded — partial state left in DB |
| maxAttendees | Zod min(1) if provided, optional | API `defaultMaxAttendees: z.number().int().min(0)` | Minor: server allows 0, client requires 1+ if set |
| requireAdvanceBooking | boolean | boolean | OK |
| minAdvanceHours | Zod min(0) | API `minAdvanceHours: z.number().int().min(0)` | OK |
| enableCancellationWindow | boolean | boolean | OK |
| cancellationCutoffHours | Zod min(0) | API `cancellationCutoffHours: z.number().int().min(0)` | OK |
| bufferTimeMinutes | Zod min(0), max(480) | API `bufferTimeMinutes: z.number().int().min(0).max(480)` | OK |

### CategoryCommissionForm Fields

| Field | Client-side | Server-side | Mismatch? |
|-------|-------------|-------------|-----------|
| Slot weightage total | Must equal 10000 bp (100%) — toast error | Server schema: each slot `min(0).max(10000)` but no total-sum validation | SERVER does not validate total = 100%; theoretically could be bypassed via direct API call |
| maxCoaches | HTML min=1, max=10 only | API `z.number().int().min(1).max(10)` | Client only uses HTML attrs — no JS validation; invalid value submittable if user manipulates input |
| rates amount | min=0 (HTML) | API `amount: z.number().int().min(0)` | Amount sent via `rmToCents(r.amount)` — float multiplication; server expects int |
| conditions non-empty | toast if empty | No server enforcement | Consistent |

---

## 6. State Transitions & Side Effects

### Mutation → Query Invalidation Map

| Mutation | Invalidated queries |
|----------|---------------------|
| `serviceCategories.create` | `orpc.serviceCategories.list.key()`, `orpc.serviceCategoryConfig.getByCategoryId.key()` |
| `serviceCategories.update` (edit) | Same as create |
| `serviceCategories.update` (deactivate from data-table) | `orpc.serviceCategories.list.key()` only |
| `serviceCategoryConfig.upsert` | Invalidated by the create/update mutation via `useApiMutation`'s `invalidate` array |
| `categoryCommission.upsert` | None — `useApiMutation` has no `invalidate` key set in `CategoryCommissionForm`; the query key `["categoryCommission", orgId, categoryId]` is NOT invalidated after save |

### Dialog State Transitions

```
isAddDialogOpen=true → [user fills] → submit → success → onClose() → isAddDialogOpen=false
                                              → error   → dialog stays open, toast shown

isDetailDialogOpen=true → [edit click] → onClose() → isEditDialogOpen=true
                        → [deactivate click] → showDeleteConfirm=true
                                             → confirm → deactivate → onDelete success → onClose() both dialogs
isCommissionSheetOpen=true → save → success → onOpenChange(false)
```

### Toast Messages

| Action | Success | Error |
|--------|---------|-------|
| Create category | "Service category created" | `err.message \|\| "Failed to save service category"` |
| Edit category | "Service category updated" | same |
| Deactivate (from table) | "Category deactivated" | `err.message \|\| "Failed to deactivate category"` |
| Deactivate (from detail dialog) | (handled by parent toast) | `toast.error(message)` directly |
| Commission save | "Commission config saved" | `err.message \|\| "Failed to save"` |

---

## 7. RBAC / Permission Branches

### Route Level
- `requirePermission("service_management:read")` in `beforeLoad` — redirects to `/dashboard?unauthorized=true` if missing.

### API Level — serviceCategories.list
- `client` role: no permission check (reads freely).
- Any other role: `service_management:read` required.
- Additionally scoped by `accessibleNodeIds` via hierarchy.

### API Level — serviceCategories.getById
- Same role branch as list.
- Additionally: `guardInputBranchForContext(context, category.branchId)` — staff cannot fetch categories outside their hierarchy scope.

### API Level — serviceCategories.create
- Requires `service_management:create`.
- `guardInputBranchForContext` on `input.branchId` (but form always sends `null` as branchId).

### API Level — serviceCategories.update (edit + deactivate)
- Requires `service_management:update`.
- `guardInputBranchForContext` on BOTH `existing.branchId` AND `input.branchId`.

### API Level — serviceCategoryConfig.upsert
- Checks `service_management:create` OR `service_management:update` (tries both, uses first that passes).

### API Level — serviceCategoryConfig.getByCategoryId
- Requires `service_management:read`.

### API Level — categoryCommission.getByCategory
- Requires `category_commission_management:read`.

### API Level — categoryCommission.upsert
- Requires `category_commission_management:create`.

### API Level — trainerTiers.list (in commission form)
- Requires `trainer_tier_management:read`.

### Frontend Gap
- The Categories tab renders for any user who passes `service_management:read`.
- "Add Category", "Edit", and "Deactivate" buttons are always visible in the UI — there is NO client-side RBAC guard hiding them for read-only users.
- Users lacking `service_management:create`/`update` will see the buttons, open the dialogs, fill forms, and only get a FORBIDDEN error on submit.

---

## 8. Known Gaps and Risks

### GAP-1: List error state silent failure
`categories-page.tsx` never reads `isError` from `useQuery`. On a network error, `data` defaults to `[]` and the user sees an empty table — indistinguishable from "no categories".

### GAP-2: Partial create on duration=0
When a user submits the form with `duration=0`: `serviceCategories.create` succeeds (category created in DB), then `serviceCategoryConfig.upsert` fails with BAD_REQUEST (server requires `min(1)` for `defaultDuration`). The category exists without any config. The UI shows error toast but the category appears in the list without config. Re-submitting opens a new dialog (create mode), creating a duplicate.

### GAP-3: Commission config not invalidated after save
After `categoryCommission.upsert` succeeds, the query key `["categoryCommission", organizationId, categoryId]` is NOT invalidated. Reopening the Commission Config sheet will show stale data until the cache naturally expires. The status badge ("Configured" / "No config yet") will also be stale.

### GAP-4: Edit mode only updates name
`ServiceFormDialog` in edit mode calls `client.serviceCategories.update({ id, name })` — only the `name` field is sent. `description`, `displayOrder`, `branchId`, and `isActive` cannot be changed via this form, even if the user expects them to be settable.

### GAP-5: No reactivation path in UI
Deactivated categories disappear from the list (API returns all, including inactive, since `isActive` filter is not passed from the frontend). Wait — actually the `list` call does NOT pass `isActive` filter (it is optional), so inactive categories ARE shown in the table with "Inactive" badge. However, there is NO UI action to reactivate a category — the only mutation available for isActive is setting it to `false`. To reactivate, a user must use the edit form, but the form does not expose `isActive`.

### GAP-6: Commission form — no query invalidation + no delete action
The `CategoryCommissionForm` has no delete button exposed — `categoryCommissionRouter.delete` exists on the server but has no corresponding frontend trigger. Also, commission config is not re-fetched after save.
