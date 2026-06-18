# Promotions Tab — Functional Map

**Route:** `/_authenticated/dashboard/_layout/service/view?tab=promotions`
**Route file:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`
**Component:** `apps/web/src/components/pages/services/promotions-page.tsx`
**API router:** `packages/api/src/routers/promotions.ts`
**Service layer:** `packages/services/src/promotions.service.ts`

---

## 1. Interactive Elements

| Element | Type | Location | Action |
|---|---|---|---|
| Tab pill "Promotions" | button | ServicesTabPage (view.tsx:71) | Navigates to `?tab=promotions` via TanStack Router |
| Search input | text input | Action bar | Filters `filteredData` client-side by `code` and `name` (case-insensitive) |
| **New Promotion** button | button | Action bar | Sets `createOpen = true`, opens Create Dialog |
| **Edit** row button | button | Each table row | Calls `handleOpenEdit(row)` → populates `editForm`, sets `editOpen = true` |
| **Deactivate** row button | button | Each active row only | Sets `deactivateTarget = row.id`, opens Confirm Deactivate dialog |
| Code cell | CopyableCell | Table | Copies promo code to clipboard |

### Create Dialog Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Code | text input | Yes | "" | Auto-uppercased on every keystroke; mono font |
| Name | text input | Yes | "" | |
| Description | textarea | No | "" | |
| Type | select | Yes | "percentage" | percentage, fixed_amount, free_item, buy_x_get_y |
| Value | number input (step 0.01, min 0.01) | Yes | "" | Label changes per type; cleared when type changes |
| Minimum Order Amount (RM) | number input (step 0.01, min 0) | No | "" | |
| Usage Limit | number input (step 1, min 1) | No | "" | blank = unlimited |
| Per Customer | number input (step 1, min 1) | No | "1" | |
| Valid From | datetime-local | Yes | "" | |
| Valid Until | datetime-local | No | "" | blank = no expiry |
| Cancel button | button | — | — | Resets form to `defaultCreateForm`, closes dialog |
| Create Promotion button (submit) | button | — | — | Triggers `handleCreateSubmit` |

### Edit Dialog Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text input | No | Pre-populated from row |
| Description | textarea | No | Pre-populated from row |
| Valid From | datetime-local | Yes | Pre-populated; shown as `datetime-local` string |
| Valid Until | datetime-local | No | Pre-populated or empty |
| Cancel button | button | — | Closes dialog, clears `editTarget` |
| Save Changes button (submit) | button | — | Triggers `handleEditSubmit` |

### Deactivate Confirmation Dialog

| Element | Type | Action |
|---|---|---|
| Cancel button | button | Clears `deactivateTarget` (null), closes dialog |
| Deactivate button | button | Calls `deactivatePromotion(deactivateTarget)`, then clears target |

---

## 2. User Journeys

### Golden Path — List Promotions
1. Authenticated user navigates to `/dashboard/service/view?tab=promotions`
2. Route `beforeLoad` calls `requirePermission("service_management:read")`; passes for authorized user
3. `PromotionsPage` mounts; `useUserContext` resolves `organizationId`
4. `useQuery` fires `client.promotions.list({ organizationId })`
5. Server: `assertOrgContextMatch` checks org, `guardBranchAccessible` skipped (no branchId), `requirePermissionOrpc(…, "promotion_management", "read")` enforced
6. Service: `listPromotions` queries `promotions` table ordered by `createdAt DESC`, default limit 50
7. Table renders with Code, Name, Type, Value, Valid From, Valid Until, Usage count/limit, Status, Actions columns

### Golden Path — Create Promotion (Percentage)
1. Click **New Promotion** → Create Dialog opens
2. Fill Code = "SAVE20", Name = "Save 20", Type = "percentage", Value = "20", Valid From = datetime
3. Client validates: code ≥ 3 chars, code matches `[A-Z0-9_-]+/i`, value > 0 and ≤ 100, validFrom present, validUntil > validFrom (if set)
4. `storedValue = Math.round(20 * 100) = 2000` (basis points)
5. `createPromotion` called with `value: 2000`
6. Server: `assertOrgContextMatch`, `requirePermissionOrpc(…, "promotion_management", "create")`
7. Service: `createPromotion` inserts row, writes audit log
8. `useApiMutation` invalidates `["promotions", organizationId]`, shows toast "Promotion created successfully.", closes dialog, resets form

### Golden Path — Create Promotion (Fixed Amount)
Same as above except:
- Value = "10.00" (RM) → `storedValue = Math.round(10.00 * 100) = 1000` (cents)
- `minimumOrderAmount` = rmToCents(rawMinOrder) if provided

### Alternate — Create with Usage Limit and Per Customer Limit
- Usage Limit = "100", Per Customer = "2" → parsed via `parseInt`

### Golden Path — Edit Promotion
1. Click **Edit** on a row → Edit Dialog opens with name, description, validFrom, validUntil pre-populated
2. Only name, description, validFrom, validUntil are editable; code and type shown read-only in info block
3. Client validates: validFrom present, validUntil > validFrom if set
4. `updatePromotion` called: server checks `requirePermissionOrpc(…, "promotion_management", "update")`
5. Service: `updatePromotion` applies partial update, sets `updatedAt = new Date()`
6. Invalidates query, toast "Promotion updated successfully.", closes dialog

### Golden Path — Deactivate Promotion
1. Click **Deactivate** on an active row → Confirm dialog with promotion name
2. Click **Deactivate** confirm → `deactivatePromotion(id)` called
3. Server: `requirePermissionOrpc(…, "promotion_management", "delete")`
4. Service: `deactivatePromotion` sets `isActive = false`, writes audit
5. Query invalidated; toast "Promotion deactivated."; Deactivate button disappears from row (isActive now false)

### Alternate — Search / Filter
- Typing in search box instantly filters `data` by `code` or `name` (includes, case-insensitive)
- No API call; purely client-side on already-fetched data
- Table shows count of filtered results

---

## 3. Data States

| State | Handled? | How |
|---|---|---|
| `organizationId` null (no org selected) | YES | Returns centred message "Select an organization to view promotions." |
| Loading (query pending) | YES | Returns `<PageLoader />` |
| Error (query failed) | YES | Returns `<StatusCallout variant="error">` with Retry button calling `refetch()` |
| Empty list (no promotions) | YES | Table renders empty-state row "No promotions found." |
| Empty search results | YES | Table renders "No promotions match your search." |
| Inactive promotion | YES | "Deactivate" button hidden; Status badge shows "Inactive" |
| Active promotion | YES | "Deactivate" button shown; Status badge shows "Active" (green) |
| `usageLimit` null (unlimited) | YES | Displays "∞" in Usage column |
| `validUntil` null (no expiry) | YES | `formatDateDisplay` returns "No expiry" |
| Network error on mutation | YES | `useApiMutation` shows error toast via `errorMessage` callback |
| **Loading state during deactivate** (button disabled) | PARTIAL | `isDeactivating` disables the Deactivate button in the confirmation dialog, but the row-level button does NOT check `isDeactivating` — it only reads `disabled={isDeactivating}` for the confirm button |
| **Stale data after tab switch** | UNHANDLED | No `refetchOnWindowFocus` override; TanStack Query default behavior (refetch on focus) applies, but no explicit forced re-fetch when tab is re-activated |
| **Concurrent deactivation of multiple promotions** | UNHANDLED | A second click on another row's Deactivate while a mutation is pending will open a second confirm dialog and a second mutation can fire |

---

## 4. Per-Field Validation

### Create Form — Client vs. Server

| Field | Client guard | Server guard | Mismatch / Gap |
|---|---|---|---|
| Code | ≥ 3 chars; `/^[A-Z0-9_-]+$/i`; trimmed | `z.string().min(1)` (min 1, not 3); no regex | **MISMATCH**: server accepts 1–2 char codes and codes with special chars that client rejects; conversely client blocks valid codes |
| Code uniqueness | None | DB uniqueIndex `promotions_code_idx` → DB-level unique constraint error propagated as unhandled exception | No structured duplicate-code error surfaced to user; raw DB error shown |
| Name | HTML `required` only | `z.string().min(1)` | Aligned |
| Type | Select default "percentage" enforced | `z.enum([…])` | Aligned |
| Value (numeric) | `rawValue > 0`, `type=percentage → rawValue ≤ 100`; `NaN` check | `z.number().int().positive()` | **MISMATCH**: client accepts decimals (e.g. 20.5%), multiplies by 100 → `storedValue = 2050`; server accepts any positive integer; no server-side cap for percentage > 10000 basis points |
| Value = 0 | Client: `rawValue <= 0` → error | Server: `z.number().int().positive()` | Aligned |
| Minimum Order Amount | NaN/≤0 → treated as `undefined` (no minimum) | `z.number().int().optional()` | **MISMATCH**: client sends cents via `rmToCents()`, but server schema just takes int — no validation that minimumOrderAmount ≥ 0; if user enters negative number client skips it (treat as no minimum) but server would accept negative if somehow passed |
| Usage Limit | `parseInt`, NaN/≤0 → `undefined` | `z.number().int().optional()` | Aligned |
| Per Customer Limit | `parseInt`, NaN/≤0 → `undefined` | `z.number().int().optional()` | **DEFAULT DIVERGENCE**: client default input value is "1" (`perCustomerLimit: "1"`), but if user clears to empty the parseInt returns NaN → `undefined` sent → service sets `perCustomerLimit ?? 1` in DB. Effectively always 1 or more. Aligned by accident. |
| Valid From | Required check in JS | `z.string().datetime()` | Aligned |
| Valid Until | `validUntil > validFrom` if set | No cross-field validation on server | **GAP**: server does not enforce validUntil > validFrom; can create expired-at-creation promotion via API |

### Edit Form — Client vs. Server

| Field | Client guard | Server guard | Mismatch / Gap |
|---|---|---|---|
| Name | `.trim()` only; empty string → sends `undefined` to server | `z.string().optional()` | Acceptable but allows clearing name to undefined (no server min-length on update) |
| Valid From | Required check in JS | `z.string().datetime().optional()` on server | **MISMATCH**: client always sends validFrom; server accepts it as optional — meaning the server allows an update with no validFrom, but the UI always sends it |
| Valid Until | `validUntil > validFrom` if set | No cross-field check | **GAP**: same as create — server allows validUntil ≤ validFrom |
| isActive toggle | Not exposed in UI | Accepted by server via `update` procedure | **MISSING FEATURE**: `isActive` can be set via API update but no UI toggle exists. Deactivate-only is a soft limitation. |

---

## 5. Value Encoding Details

- **percentage**: `storedValue = Math.round(rawValue * 100)` basis points. E.g. 20% → 2000.
  - `formatPromotionValue` displays `(value / 100).toFixed(2)%` → "20.00%"
  - `validatePromoCode` calculates `discountAmount = floor((orderAmount * value) / 10000)`
- **fixed_amount**: `storedValue = Math.round(rawValue * 100)` cents via implicit use of `rmToCents`-style multiplication.
  - Wait: looking at code: `storedValue = Math.round(rawValue * 100)` where rawValue came from `parseFloat(createForm.value)`. For fixed_amount the user enters e.g. "10.00" → `storedValue = 1000`. This matches the DB convention (cents). But `formatPromotionValue` calls `formatPrice(value, "MYR")` which divides by 100, so display is correct.
- **free_item / buy_x_get_y**: `storedValue` is an arbitrary integer; `formatPromotionValue` calls `.toString()` — no unit label shown.

---

## 6. State Transitions and Side Effects

| Mutation | Invalidates Query Keys | Toast | Dialog Close | Other |
|---|---|---|---|---|
| `createPromotion` success | `["promotions", organizationId]` | "Promotion created successfully." | `createOpen = false`, form reset | Audit log written server-side |
| `createPromotion` error | None | err.message or "Failed to create promotion." | Dialog stays open | — |
| `updatePromotion` success | `["promotions", organizationId]` | "Promotion updated successfully." | `editOpen = false`, `editTarget = null` | Audit NOT written (updatePromotion has no writeAudit call) |
| `updatePromotion` error | None | err.message or "Failed to update promotion." | Dialog stays open | — |
| `deactivatePromotion` success | `["promotions", organizationId]` | "Promotion deactivated." | Dialog cleared (`deactivateTarget = null`) | Audit log written server-side |
| `deactivatePromotion` error | None | err.message or "Failed to deactivate promotion." | Dialog cleared regardless (`setDeactivateTarget(null)` called before mutation) | **BUG**: target is cleared before mutation completes; if mutation errors the confirmation dialog disappears but the promotion is not deactivated — user gets error toast with no way to retry from the confirmation |

---

## 7. RBAC / Permission Branches

### Route level (`beforeLoad`)
- `requirePermission("service_management:read")` — gates the entire `/service/view` page (all tabs). If permission missing → redirected to `/dashboard?unauthorized=true`.

### API level (server-side)
| Procedure | Permission required |
|---|---|
| `list` | `promotion_management:read` |
| `validate` | `promotion_management:read` |
| `apply` | `promotion_management:create` |
| `create` | `promotion_management:create` |
| `update` | `promotion_management:update` |
| `deactivate` | `promotion_management:delete` |

### UI-level visibility
- No UI-level permission check in `PromotionsPage` — all buttons (New Promotion, Edit, Deactivate) are visible to any user who can reach the page. A user with only `promotion_management:read` but lacking `create`/`update`/`delete` will see all action buttons but get a FORBIDDEN error on action. **No UI guard matches API guard.**

### Branch access
- `list`, `validate`, `create` call `guardBranchAccessible` when `input.branchId` is provided
- Component never passes `branchId` to `list` — the list fetches ALL promotions regardless of branch scope
- A branch-scoped staff member sees all org promotions (no branch filter applied)

---

## 8. Other Observations

- **`maximumDiscount` (capped percentage discount)**: DB column exists, `validatePromoCode` respects it, `createPromotion` service accepts it — but the Create Dialog has **no field** for `maximumDiscount`. It can only be set via API.
- **`applicableProductIds` / `applicableServiceIds`**: DB columns exist, service accepts them — but UI has no fields. These restriction arrays can only be set via API.
- **`branchId` on create**: DB column + server accept it — UI has no field. Always creates org-wide promotions.
- **Pagination**: `listPromotions` defaults to `limit: 50, offset: 0`. Component passes no limit/offset. With > 50 promotions only the first 50 are shown with no indication of truncation and no load-more/pagination UI.
- **Date timezone**: `toIsoDatetime` calls `new Date(localDt).toISOString()` — converts browser-local datetime-local input to UTC ISO string. `toDatetimeLocal` converts back using `d.getHours()`/`d.getMinutes()` — these reflect the client's local timezone. Round-trip works correctly only if the browser timezone doesn't change between create and edit.
- **Code uniqueness UX**: DB has `uniqueIndex` on `code`. If a duplicate code is submitted, the DB throws a constraint error that propagates as an unhandled exception in `createPromotion` service (no try/catch for unique violation) → the error message shown to the user will be a raw Drizzle/Postgres error string, not a user-friendly message.
- **`updatePromotion` no audit log**: `createPromotion` and `deactivatePromotion` call `writeAudit`; `updatePromotion` does not — changes to name, description, and validity window are not audited.
- **Tab navigation**: Clicking a different service tab and returning to Promotions reuses the cached query (no forced refetch). Changes made in another browser tab will not reflect until the staleTime lapses or the window regains focus.
