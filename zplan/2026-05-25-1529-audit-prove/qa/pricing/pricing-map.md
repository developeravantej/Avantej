# Pricing Tab — White-Box Functional Map

**Source files traced:**
- Route: `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`
- Component: `apps/web/src/components/pages/services/pricing-page.tsx`
- Dialog: `apps/web/src/components/pages/services/service-price-override-dialog.tsx`
- API router: `packages/api/src/routers/services/pricing.procedures.ts`
- Service layer: `packages/services/src/pricing.service.ts`
- DB schema: `packages/db/src/schema/tenant/service-prices.ts`
- Guards: `packages/api/src/guards.ts`
- Money lib: `apps/web/src/lib/money.ts`

---

## 1. Interactive Elements

### Filter Bar (pricing-page.tsx)

| Element | Type | State | What it does |
|---|---|---|---|
| Service select | `<Select>` | Enabled always | Sets `selectedServiceId`. Triggers `listPriceOverrides` query when a value is chosen. Clears table when value changes. |
| Add Override button | `<button>` | Disabled when `!selectedServiceId` | Opens `ServicePriceOverrideDialog` with the current `selectedServiceId` as default. |

### Overrides Table (per row)

| Element | Type | What it does |
|---|---|---|
| Expire button | `<button>` | Sets `expireConfirmId` to row.id, opens Expire confirmation dialog. |
| Delete button | `<button>` | Sets `deleteConfirmId` to row.id, opens Delete confirmation dialog. |

### Expire Confirmation Dialog

| Element | Type | What it does |
|---|---|---|
| Cancel button | `<Button variant="outline">` | Clears `expireConfirmId`, closes dialog. No mutation. |
| Expire Override button | `<Button>` | Calls `handleExpire()`. Disabled while `isExpiring`. |

### Delete Confirmation Dialog

| Element | Type | Type | What it does |
|---|---|---|---|
| Cancel button | `<Button variant="outline">` | | Clears `deleteConfirmId`, closes dialog. No mutation. |
| Delete Override button | `<Button variant="destructive">` | | Calls `handleDelete()`. Disabled while `isDeleting`. |

### Add Override Dialog (service-price-override-dialog.tsx)

| Element | Type | Default | What it does |
|---|---|---|---|
| Service select | `<Select>` | `defaultServiceId` prop | Selects which service the override applies to. |
| Branch select | `<Select>` | `"__org_wide__"` | Maps to `branchId: null` when `__org_wide__` selected; otherwise sets a real branchId UUID. |
| Customer Type select | `<Select>` | `"__all__"` | Maps to `customerType: null` when `__all__`; otherwise `"member"` or `"walk_in"`. |
| Price input | `<Input type="number" min=0 step=0.01 required>` | `""` | RM amount. Parsed by `rmToCents()` on submit. |
| Effective From | `<Input type="datetime-local">` | `localDatetimeDefault()` (now, local TZ offset) | Start of validity window. |
| Effective Until | `<Input type="datetime-local">` | `""` (empty = open-ended) | End of validity window. Empty string passes `null` to the API. |
| Cancel button | `<Button variant="outline">` | | Calls `handleOpenChange(false)` → `resetForm()` + closes dialog. |
| Save Override button | `<Button type="submit">` | | Submits the form. Disabled while `isSaving`. |

---

## 2. User Journeys

### 2.1 Golden Path — Add Price Override
1. Navigate to `/dashboard/service/view?tab=pricing`.
2. Select a service from the dropdown.
3. Table shows existing overrides (or empty state).
4. Click **Add Override**.
5. In dialog: confirm/change service, choose branch (or org-wide), choose customer type (or All), enter price RM, confirm Effective From (defaults to now), leave Effective Until blank (open-ended).
6. Click **Save Override**.
7. `client.services.setBranchPrice()` is called.
8. `toast.success("Price override saved.")` shown.
9. Dialog closes and `resetForm()` is called.
10. `invalidateOverrides()` refetches the overrides query; table updates.

### 2.2 Golden Path — Expire an Override
1. Select service (overrides load).
2. Click **Expire** on a row.
3. Confirmation dialog opens.
4. Click **Expire Override**.
5. `client.services.expireBranchPrice()` called with `priceId`.
6. `toast.success("Price override expired.")` shown.
7. `invalidateOverrides()` — row disappears because `effectiveUntil = now()` makes it fail the `effectiveUntil > at` filter.
8. `expireConfirmId` cleared, dialog closes.

### 2.3 Golden Path — Delete an Override
1. Select service (overrides load).
2. Click **Delete** on a row.
3. Confirmation dialog opens.
4. Click **Delete Override**.
5. `client.services.deleteBranchPrice()` called with `priceId`.
6. `toast.success("Price override deleted.")` shown.
7. `invalidateOverrides()` — row removed from table.
8. `deleteConfirmId` cleared, dialog closes.

### 2.4 Alternate — Add Override with Branch Scope
Same as 2.1, but select a specific branch (from `branchNodes` filtered by `type === "branch"`).
Server calls `guardInputBranchForContext` — if member's scope doesn't include the branch, server returns FORBIDDEN.

### 2.5 Alternate — Add Override with Date Range (finite)
Enter both Effective From and Effective Until. Server inserts with both timestamps. Override disappears from `listPriceOverrides` after `effectiveUntil` passes.

### 2.6 Alternate — Cancel / Dismiss Dialog
User opens Add Override dialog, then clicks Cancel or closes dialog (onOpenChange(false)).
`resetForm()` restores all fields to defaults. No API call.

### 2.7 Alternate — Dismiss Expire/Delete Confirmation
User opens confirmation, clicks Cancel. `expireConfirmId`/`deleteConfirmId` cleared. No API call.

---

## 3. Data States Handled vs Unhandled

### pricing-page.tsx

| State | Handled? | How |
|---|---|---|
| `!organizationId` | Yes | Full-page centered message "Select an organization to manage pricing." |
| No service selected | Yes | Dashed empty-state box "Select a service above to view its price overrides." |
| Overrides loading | Yes | `"Loading..."` centered text |
| Overrides empty (service selected) | Yes | Dashed empty-state box "No price overrides configured for this service." |
| Overrides loaded (non-empty) | Yes | Table renders all rows |
| Services query loading | NOT HANDLED | If `services = []` while loading, select renders empty. No loading indicator. |
| Services query error | NOT HANDLED | Silently shows empty select. |
| Hierarchy data loading | NOT HANDLED | `branchMap` is empty; branch names degrade to raw UUID strings in table. No indicator. |
| Hierarchy data error | NOT HANDLED | Same as loading — silent. |
| Overrides query error | NOT HANDLED | Query returns `data = undefined`, falls back to `overrides = []`, which renders the "no overrides" empty state — misleading (error vs genuinely empty). |
| `expireBranchPrice` error | Partially | `toast.error("Failed to expire price override.")` shown, but error message from server is NOT forwarded to user. |
| `deleteBranchPrice` error | Partially | Same — generic toast, no server detail. |

### service-price-override-dialog.tsx

| State | Handled? | How |
|---|---|---|
| Service not selected on submit | Yes | `toast.error("Please select a service.")` |
| Invalid price on submit | Yes | `toast.error("Enter a valid price in RM.")` |
| `setBranchPrice` success | Yes | `toast.success("Price override saved.")` |
| `setBranchPrice` error | Yes | Server error message forwarded: `err instanceof Error ? err.message : "..."` |
| Services list loading in dialog | NOT HANDLED | Select shows empty while loading. No spinner/placeholder. |
| Hierarchy nodes loading in dialog | NOT HANDLED | Branch select shows only "Org-wide / All branches" option while loading. |
| Dialog open when `defaultServiceId` changes | NOT HANDLED | `useState(defaultServiceId ?? "")` captures the value at first render; if `defaultServiceId` prop changes while dialog is already closed and re-opened, `serviceId` state is NOT reset (only `resetForm()` is called on close, which does re-read `defaultServiceId` — so it IS handled on re-open via `resetForm()`). |

---

## 4. Per-Field Validation

### Price (RM) Field

| Layer | Guard | Detail |
|---|---|---|
| HTML | `min="0"`, `step="0.01"`, `required` | Browser blocks blank submission; min=0 blocks negative via native UI, but does NOT block typing negative in all browsers. |
| Client (submit) | `rmToCents(priceRm)` throws if `value < 0` or `NaN` | `toast.error("Enter a valid price in RM.")`. Does NOT check if price is empty string before calling `rmToCents` — but `Number.parseFloat("")` returns `NaN`, so the throw path fires. However the `required` HTML attribute should prevent blank submission first. |
| Server | `z.number().int().min(0)` | Rejects negative int. Minimum is 0 (free service allowed). |
| Mismatch | `rmToCents` uses `Math.round(value * 100)` — floating point values like `0.001` round to 0, silently accepted by both client and server. No maximum price cap at any layer. |

### Effective From

| Layer | Guard | Detail |
|---|---|---|
| HTML | `type="datetime-local"` | Browser picker. No `min` attribute — past dates accepted. |
| Client | None beyond non-empty string | `new Date(effectiveFrom).toISOString()` — any valid datetime string passes. |
| Server | `z.string().datetime().optional()` | ISO 8601 format required. No past-date rejection. |
| Gap | No past-date guard. A user can set `effectiveFrom` in 2020 — override immediately becomes "current" and is returned by `listServicePriceOverrides`. |

### Effective Until

| Layer | Guard | Detail |
|---|---|---|
| HTML | `type="datetime-local"` | No `min` attribute. |
| Client | None | Empty string → sends `null` (open-ended). Non-empty → `new Date(effectiveUntil).toISOString()`. |
| Server | `z.string().datetime().nullable().optional()` | No lower-bound check vs `effectiveFrom`. |
| Gap | **No overlap detection at any layer.** Multiple overrides with the same (serviceId, branchId, customerType) and overlapping date ranges can be inserted. Resolution relies on the tie-breaking logic in `pickMostSpecific` (most recent effectiveFrom wins among same-score candidates). No error is raised; the behavior is silent. |
| Gap | **No validation that `effectiveUntil > effectiveFrom`.** A row where `effectiveUntil <= effectiveFrom` is inserted, silently produces a zero-width or negative window, and will never be returned by `listServicePriceOverrides` (it fails the `effectiveFrom <= at AND effectiveUntil > at` filter), but also never errors. |

### Service Select

| Layer | Guard | Detail |
|---|---|---|
| Client | `if (!serviceId) toast.error(...)` | Present. |
| Server | `z.string().uuid()` | UUID required. |

### Branch Select

| Layer | Guard | Detail |
|---|---|---|
| Client | None (defaults to `__org_wide__` → null) | Any selection is accepted. |
| Server (setBranchPrice) | `guardInputBranchForContext` | If branchId is non-null and not in member's accessible nodes, throws FORBIDDEN. |
| Gap | No feedback tells the user which branches are inaccessible. The branch list in the dialog shows ALL branches of type "branch" from the hierarchy query — a staff-scoped user can see and attempt to set a branch they don't have access to, only to get a FORBIDDEN error after submit. |

### Customer Type

| Layer | Guard | Detail |
|---|---|---|
| Client | Select with 3 options, defaults to `__all__` | No extra validation. |
| Server | `z.string().nullable().optional()` | Free text — no enum enforcement. Any string passes. |
| Gap | The DB schema stores `customerType` as `text` with no check constraint. The UI only offers `member`, `walk_in`, `null`. A direct API call with an arbitrary string passes server-side Zod validation and inserts fine, but `listPriceOverrides` will never show it in the "Member / Walk-in / All" display — it would render the raw string. |

---

## 5. State Transitions & Side Effects

### setBranchPrice
- Mutation: INSERT into `service_prices`.
- Side effects: `invalidateOverrides()` → refetch `["service-price-overrides", orgId, serviceId]`.
- No other queries invalidated. The `services.list` query is NOT invalidated (the service's base price is unchanged).
- Toast: success on OK, error with server message on failure.

### expireBranchPrice
- Mutation: UPDATE `service_prices SET effective_until = now()` WHERE id.
- Side effects: same `invalidateOverrides()` invalidation.
- Note: the server sets `effectiveUntil` to `new Date()` (server time). The row is then excluded from future `listServicePriceOverrides` results because `effectiveUntil > at` fails. The row still exists in the DB (not deleted).
- Toast: generic success. Error message from server NOT forwarded (generic "Failed to expire..." always).

### deleteBranchPrice
- Mutation: DELETE from `service_prices` WHERE id.
- Side effects: same `invalidateOverrides()` invalidation.
- Toast: generic success. Error message NOT forwarded.

### Query key shape (important for invalidation correctness)
- `listPriceOverrides` is fetched with manual `queryFn` key `["service-price-overrides", orgId, serviceId]`.
- `invalidateOverrides()` matches this exact key.
- Changing `selectedServiceId` in the select naturally triggers a new query (different key), so stale data from a previous service is never shown for the new selection.

---

## 6. RBAC / Permission Branches

### Route-level (beforeLoad)
- `requirePermission("service_management:read")` — checked against localStorage-cached `userContext`.
- **Gap (known):** The MEMORY.md note confirms permission cache in localStorage may be stale after new grants. Users may access the page without having the permission if a stale positive is cached.

### API-level per procedure

| Procedure | Permission required |
|---|---|
| `listPriceOverrides` | `service_management:read` — UNLESS `member.role === "client"` (clients bypass the check) |
| `resolvePrice` | `service_management:read` — UNLESS `member.role === "client"` |
| `setBranchPrice` | `service_management:update` |
| `expireBranchPrice` | `service_management:update` |
| `deleteBranchPrice` | `service_management:delete` |

### Branch-scoping guard (expireBranchPrice / deleteBranchPrice)
- Server fetches the service that owns the price row, then checks whether `svc.branchId` is in `accessibleNodeIds`.
- **Bug candidate:** The guard checks `svc.branchId` (the service's own branch) — NOT the `servicePrices.branchId` (the override's branch). An org-wide override (`servicePrices.branchId = null`) on a branch-scoped service would have `svc.branchId` set, triggering the scope check. An org-wide override on an org-wide service would have `svc.branchId = null` and skip the check entirely. This means the branch scoping on expire/delete is governed by the service's scope, not the price override's scope.

### Admin vs staff
- `member.role === "admin"` → `accessibleNodeIds` includes all tenant nodes → no branch restriction.
- `member.role === "staff"` → restricted to `getDescendantNodeIds(hierarchyScopeId)`.

---

## 7. `listServicePriceOverrides` — Display-Only Gap

The service function filters by `effectiveFrom <= at AND (effectiveUntil IS NULL OR effectiveUntil > at)`, meaning **future-dated overrides** (effectiveFrom > now) are NOT shown in the table. A user who creates an override with a future start date will not see it in the list immediately, and there is no UI feedback for this. The "No price overrides" empty state will appear even though the record was just saved.
