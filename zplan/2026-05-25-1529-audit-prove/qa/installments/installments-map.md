# Installment Plans Tab — Functional Map

**Route:** `/_authenticated/dashboard/_layout/service/view?tab=installments`
**Component:** `apps/web/src/components/pages/services/installment-plans-tab.tsx`
**API router:** `packages/api/src/routers/installment-plans.ts`
**Service layer:** `packages/services/src/installment-plan.service.ts`
**DB schema:** `packages/db/src/schema/tenant/installment-plans.ts`

---

## 1. Interactive Elements

### Action Bar (always visible when org selected + loaded)

| Element | Type | What It Does |
|---------|------|--------------|
| `All (N)` pill | button | Sets `filter` state to `"all"` — shows all plans |
| `Active (N)` pill | button | Sets `filter` state to `"active"` (default) — shows active plans |
| `Inactive (N)` pill | button | Sets `filter` state to `"inactive"` — shows inactive plans |
| `RM [amount]` sample input | text input | Updates `sampleAmount` state on valid numeric input; reformats on blur |
| `New Plan` button | button | Calls `openCreate()` — resets form, opens create Dialog. Disabled when any mutation is pending |

### Plan Card (per row in grid)

| Element | Type | What It Does |
|---------|------|--------------|
| `Edit` button | button | Calls `openEdit(plan)` — populates form with plan's current values, opens edit Dialog. Disabled when any mutation is pending |
| `Disable` button | button | Only visible when `plan.isActive === true`. Calls `handleDeactivateClick(plan)` — fires async service check, then opens deactivate confirmation Dialog. Disabled when any mutation is pending |
| `Set default` button | button | Only visible when `!plan.isDefault && plan.isActive`. Immediately fires `setDefaultMutation.mutate(plan.id)`. Disabled when any mutation is pending |

### Create / Edit Dialog

| Element | Type | What It Does |
|---------|------|--------------|
| `Code` input | text, `font-mono`, `disabled` when editing | Required on create. Immutable after creation — field is disabled on edit |
| `Name` input | text, `required` | Plan display name |
| `Installments` input | `type=number`, `min=1`, `step=1` | Number of installments |
| `Interval (days)` input | `type=number`, `min=1`, `step=1` | Default interval in days between installments |
| `Price Premium (%)` input | `type=number`, `min=0`, `max=100`, `step=0.01` | Markup percentage (stored as bps = value × 100) |
| `Description` textarea | 3 rows | Optional notes |
| `Set as default plan` checkbox | checkbox | Only rendered on CREATE (hidden on edit). Pre-selects form.isDefault |
| `Cancel` button | button | Calls `closeSheet()` — resets form and closes dialog. Disabled while mutation pending |
| `Add Plan` / `Save Changes` submit button | submit | Fires `handleSubmit()`. Disabled while mutation pending. Shows "Saving…" when pending |

### Deactivate Confirmation Dialog

| Element | Type | What It Does |
|---------|------|--------------|
| Service-usage warning box | conditional div | Shown if plan code appears in `s.availablePaymentPlans` for any active service |
| `Cancel` button | button | Clears `deactivateDialogOpen`, `deactivateTarget`, `deactivateWarning` state. Disabled while pending |
| `Disable` button | button | Fires `deactivateMutation.mutate(deactivateTarget.id)`. Shows "Disabling…" when pending |

---

## 2. All Journeys

### Golden Path — Create a New Plan

1. Navigate to `/dashboard/service/view?tab=installments`
2. Route `beforeLoad` checks `service_management:read` permission
3. Component mounts; `useQuery` fetches `client.installmentPlans.list({ organizationId })` — API requires `service_management:read` for non-clients
4. Grid renders with `filter = "active"` as default
5. Click `New Plan` → Create Dialog opens
6. Fill Code (e.g. `monthly_6`), Name, Installments, Interval, optional Premium/Description
7. Optionally check `Set as default plan`
8. Click `Add Plan` → `handleSubmit()` runs client-side validation; on pass, fires `createMutation.mutate(form)`
9. API: `tenantProcedure` → `assertOrgContextMatch` → `requirePermissionOrpc service_management:update` → `createInstallmentPlan(tenantDb, ...)`
10. Service: validates `numInstallments >= 1`, `pricePremiumBps 0–10000`; if `isDefault` true, clears existing defaults in same transaction; inserts new row
11. DB: `code` unique index enforced — duplicate code yields Postgres unique violation bubbled as generic 500 (not caught as BAD_REQUEST)
12. On success: `useApiMutation` fires toast "Installment plan created.", invalidates `["installmentPlans", orgId]`, calls `closeSheet()`

### Alternate — Edit an Existing Plan

1. Click `Edit` on any card → Edit Dialog opens with fields pre-populated
2. `Code` field is disabled (immutable)
3. `isDefault` checkbox NOT shown (cannot change default from edit dialog)
4. Modify Name / Installments / Interval / Premium / Description
5. Click `Save Changes` → `updateMutation.mutate({ id, values })`
6. API: `service_management:update` → `updateInstallmentPlan(tenantDb, id, { name, numInstallments, ... })`
7. Service: validates numInstallments >= 1, pricePremiumBps 0–10000 (if provided); updates row; returns updated row
8. On success: toast "Installment plan updated.", invalidates query, closes dialog

### Alternate — Set Default Plan

1. Click `Set default` on a non-default active card
2. `setDefaultMutation.mutate(plan.id)` fires immediately (no confirmation dialog)
3. API: `service_management:update` → `setDefaultInstallmentPlan(tenantDb, id)`
4. Service: in a transaction, clears all `isDefault = true` rows then sets target row `isDefault = true`
5. On success: toast "Default installment plan updated.", invalidates query

### Alternate — Disable (Deactivate) a Plan

1. Click `Disable` on an active card
2. `handleDeactivateClick(plan)` fires:
   a. Sets `deactivateTarget = plan`, clears `deactivateWarning`
   b. Fires `client.services.list({ organizationId, isActive: true })` — this call uses `service_management:read` via the same permission gate
   c. Counts services where `s.availablePaymentPlans.includes(plan.code)`; if > 0, sets `deactivateWarning` with count
3. Deactivate Dialog opens (with or without warning)
4. Click `Disable` in dialog → `deactivateMutation.mutate(deactivateTarget.id)`
5. API: `service_management:delete` → `deactivateInstallmentPlan(tenantDb, id)`
6. Service: fetches existing row; if `isDefault === true`, silently clears it; sets `isActive = false`
7. On success: toast "Installment plan deactivated.", invalidates query, closes dialog, clears target/warning state

### Alternate — Filter by Active / Inactive

1. Clicking `Active`, `Inactive`, or `All` pill updates local `filter` useState (no URL change, no refetch)
2. `rows` is computed client-side from `allRows` already in memory
3. `emptyState.description` changes: inactive filter gets "No inactive plans." message; others get default message
4. `New Plan` button in EmptyState is hidden when `filter === "inactive"`

---

## 3. Data States

### Loading
- `isLoading === true`: renders `<PageLoader />` — full-component spinner
- No orgId guard fires before isLoading check (correct: orgId guard is above isLoading)

### Empty
- Filter yields no rows + `!isError`: renders `<EmptyState icon=CreditCard ...>` with conditional description and optional `New Plan` action
- No plans exist at all vs plans exist but filter hides them — both map to same EmptyState

### Error
- `isError === true`: renders `<StatusCallout variant="error">` with retry button (`refetch()`)
- Renders above the empty-state check — grid and empty state still evaluated if `isError` (no short-circuit). However because `rows.length === 0` evaluates to `!isError && ...`, error and empty states don't overlap. Grid also gated by `!isError`. SAFE.

### No Organization Selected
- `!organizationId`: renders inline message "Select an organization to manage installment plans." (no PageLoader, no sidebar wrapper) — different from settings page which used a full `-m-6 h-screen` wrapper

### Success / Normal
- `rows.length > 0 && !isError`: renders `grid-cols-3` plan card grid

### Mutation Pending
- `isMutating = true`: all card buttons + `New Plan` become `disabled`; submit/cancel buttons in dialogs also disabled; button text changes to "Saving…" or "Disabling…"

### Deactivate warning (async pre-check)
- Warning fires before dialog opens; if services API throws, `catch {}` silently eats the error and dialog opens without warning — correct soft-fail behavior

---

## 4. Per-Field Validation

### `code`

| Layer | Guard |
|-------|-------|
| Client-side | `if (!editingId && !form.code.trim())` → `toast.error("Code is required.")` |
| Client-side HTML | `required={!editingId}` on the Input |
| Server-side router | `z.string().min(1)` — rejects empty string |
| Server-side service | No explicit validation; DB enforces `uniqueIndex("installment_plans_code_idx")` |
| **Mismatch** | Duplicate code: client sends, router accepts (no duplicate check at Zod/handler level), service inserts, Postgres unique index violation bubbles as an unhandled DB error — NOT wrapped in a `ORPCError("BAD_REQUEST")`. The `catch` in `create` handler only matches `pricePremiumBps` and `numInstallments` error messages. User sees a generic server error toast. |

### `name`

| Layer | Guard |
|-------|-------|
| Client-side | `if (!form.name.trim())` → `toast.error("Name is required.")` |
| Client-side HTML | `required` attribute on Input |
| Server-side router | `z.string().min(1)` on create; `z.string().min(1).optional()` on update |
| **Mismatch** | Update allows omitting name entirely (it's optional in Zod). However component always sends `name: values.name` so if form.name passes client guard it will always be sent. No server-side empty-string guard after trimming on update. |

### `numInstallments`

| Layer | Guard |
|-------|-------|
| Client-side | `parseInt(...)`, `Number.isNaN(n) || n < 1` → `toast.error("Installments must be ≥ 1.")` |
| Client-side HTML | `type=number min=1 step=1` |
| Server-side router | `z.number().int().min(1)` |
| Server-side service | `if (data.numInstallments < 1) throw new Error(...)` |
| Router catch | Catches `"numInstallments must be >= 1"` and wraps as `ORPCError("BAD_REQUEST")` |
| **Match** | All layers consistent. Triple redundancy. |

### `defaultIntervalDays`

| Layer | Guard |
|-------|-------|
| Client-side | `parseInt(...)`, `Number.isNaN(d) || d < 1` → `toast.error("Interval days must be ≥ 1.")` |
| Client-side HTML | `type=number min=1 step=1` |
| Server-side router | `z.number().int().min(1).optional()` on create; `z.number().int().min(1).optional()` on update |
| **Note** | Defaults to 30 in DB schema if omitted on create. Client always sends it (parseInt always produces a number). |

### `pricePremiumPct` / `pricePremiumBps`

| Layer | Guard |
|-------|-------|
| Client-side | `parseFloat(...)`, `Number.isNaN(p) || p < 0 || p > 100` → `toast.error("Premium must be 0–100%.")` |
| Client-side HTML | `type=number min=0 max=100 step=0.01` |
| Server-side router | `z.number().int().min(0).max(10000).optional()` — NOTE: `z.number().int()` means it must be an integer bps value. Client sends `Math.round(pct * 100)` so always integer. |
| Server-side service | `if (data.pricePremiumBps < 0 || data.pricePremiumBps > 10000) throw new Error(...)` |
| Router catch | Catches `"pricePremiumBps must be between"` and wraps as `ORPCError("BAD_REQUEST")` |
| **Mismatch** | Client allows fractional input (step=0.01) and `Math.round` is applied. A value like 99.995% rounds to 10000 bps — right at the boundary, passes. A value like 100.004% would round to 10000 bps and pass; 100.006% rounds to 10001 bps, fails server validation with BAD_REQUEST. The toast will show the server error message from `err.message` due to `errorMessage: (err) => err.message`. |

### `isDefault` (create only)

| Layer | Guard |
|-------|-------|
| Client-side | No validation needed; boolean checkbox |
| Server-side router | `z.boolean().optional()` |
| Server-side service | If true: clears existing defaults in same transaction before insert |
| **Note** | `isDefault` is NOT editable from edit dialog. Setting default after creation requires the `Set default` button on the card. |

---

## 5. State Transitions and Side Effects

### Query Key
```
["installmentPlans", organizationId]
```
All four mutations (`create`, `update`, `setDefault`, `deactivate`) invalidate this same key, which causes the list to refetch after any successful mutation.

### Dialog State Lifecycle

**Create Dialog:**
- Open: `openCreate()` → `setEditingId(null)`, `setForm(EMPTY_FORM)`, `setSheetOpen(true)`
- Close: `closeSheet()` → `setSheetOpen(false)`, `setEditingId(null)`, `setForm(EMPTY_FORM)` (also called by `onSuccess` of both create and update mutations)
- `onOpenChange(false)` also calls `closeSheet()`

**Deactivate Dialog:**
- Open: `handleDeactivateClick(row)` → sets `deactivateTarget`, may set `deactivateWarning`, sets `deactivateDialogOpen(true)`. NOTE: dialog opens even if services API call is still in-flight (async is awaited before dialog opens — correct)
- Close (Cancel): clears `deactivateDialogOpen`, `deactivateTarget`, `deactivateWarning`
- Close (Success): same cleanup via `onSuccess` callback
- `onOpenChange(false)` also clears all three state pieces

### Toast Events
- Create success: "Installment plan created."
- Update success: "Installment plan updated."
- Set default success: "Default installment plan updated."
- Deactivate success: "Installment plan deactivated."
- Any error: `err.message` or fallback string via `useApiMutation.onError`

### No `activate` (re-enable) path
There is no UI or API endpoint to re-enable a deactivated plan. Only `Edit` is shown on inactive cards. Edit does not expose `isActive` as a field. This is by design per the original settings page — but it means deactivation is effectively permanent from the UI.

---

## 6. Regressions from the Tab Move

### Confirmed Safe (no regression)
- All imports are present and identical to the settings page: `useQuery`, `useUserContext`, `useApiMutation`, `client`, `toast`, `useState`, `z`, UI components, `lucide-react` icons, `PageLoader`, `EmptyState`, `StatusCallout`, `cn`
- `z` is imported but **not used** in the new tab component (was used only for `validateSearch` in the route file). This is a dead import but not a regression — it will not cause a runtime error.
- All mutation logic (`createMutation`, `updateMutation`, `setDefaultMutation`, `deactivateMutation`) is identical in structure to the original

### Regression 1 — Filter is no longer URL-persisted
**Original settings page:** filter was a route search param (`validateSearch: z.object({ filter: ... })`). Navigating away and back restored the filter. Tab-switching (browser back) also preserved it.
**New tab component:** filter is `useState("active")`. Switching to another tab and back resets filter to `"active"`. This is a deliberate trade-off noted in the task brief (local state instead of route search params), but it is a behavioral regression for users who navigate away and expect to return to the same filter.

### Regression 2 — Permission guard changed
**Original settings page:** `beforeLoad` required `payments:update`
**New route file:** `beforeLoad` requires `service_management:read`

The tab component itself does not re-check permissions — it just uses the route's `beforeLoad`. A user with `service_management:read` but NOT `payments:update` can now access the installment plans tab, but the `create` / `update` / `deactivate` API calls require `service_management:update` or `service_management:delete`. They will fail at the API layer with a permissions error, but the UI will not prevent them from trying. Conversely, a user with `payments:update` (the old gate) but not `service_management:read` is now denied access to this tab at all. This is likely an intentional re-classification from a payments permission to a service_management permission, but it is a behavioral change.

### Regression 3 — No page header / count summary
**Original settings page:** rendered a full page header with "INSTALLMENT PLANS" label, "Installment Plans" H1, and plan count ("3 plans · 2 active").
**New tab component:** no page header (the outer `ServicesTabPage` provides a shared header for all tabs, but it just says "Services"). The installment plans count summary is absent. Not a functional regression, but information loss.

### Regression 4 — `New Plan` button position moved
**Original settings page:** `New Plan` was in the top-right of a dedicated header row.
**New tab component:** `New Plan` is at the far right of the filter/sample-amount action bar (via `ml-auto`). Sample amount input no longer has `ml-auto` (it sits between filter pills and the New Plan button). Functionally equivalent but layout changed.

### Non-regression: `z` import is unused
`z` is imported in `installment-plans-tab.tsx` but never used (it was only used for `validateSearch` in the standalone route). This is a lint warning, not a runtime error. oxlint may flag it.

---

## 7. Unhandled Edge Cases / Gaps

1. **Duplicate code on create** — no client-side uniqueness check; server returns an unformatted Postgres unique violation error (not mapped to BAD_REQUEST). User sees a generic/raw DB error message.
2. **No re-activation path** — plans can be disabled but never re-enabled from the UI.
3. **`isDefault` cannot be unset** — no UI action un-sets the default flag (would require setting another plan as default, which shifts the flag).
4. **`sortOrder` not exposed** — the DB and API support `sortOrder` for display ordering, but no UI control exists.
5. **Deactivating the default plan** — service layer silently clears `isDefault` flag on deactivation. UI does not warn the user that deactivating a default plan will leave no default selected. The deactivate dialog mentions "disable" but not the default-clearing side effect.
6. **`setDefault` on inactive plan** — button is hidden when `!plan.isActive` so not reachable from UI, but no server-side guard prevents calling `setDefault` on an inactive plan ID directly via API.
7. **Sample amount <= 0 not handled visually** — the `onChange` handler for sample input only updates `sampleAmount` if `n > 0`. If user types `0` or a negative, `sampleInput` updates but `sampleAmount` stays at last valid value. The input and display diverge until blur (which reformats to last valid). Slight UX confusion but no crash.
8. **`services.list` in deactivate warning fetches ALL active services** — for large catalogs this is a potentially expensive uncached call fired on each Disable click. It is not cached under a query key. If service list is large, this adds latency before the dialog opens.
