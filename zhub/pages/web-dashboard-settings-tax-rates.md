# Tax Configuration

**Route:** `/dashboard/settings/tax-rates`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/tax-rates.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage tax rates applied to sales orders (SST, GST, service tax, withholding tax, tax exempt, or custom).
**Produces:** Table of active/inactive tax rates with CRUD operations, form to create/edit, rate display as percent with basis points indicator.
**On success:** Rate created/updated/deactivated; table refreshes; toast confirmation.
**On failure / error states:** Loading spinner, error card with retry button, form validation toasts.

---

## 2. How It Works

**Execution flow:**
1. Page loads; `useUserContext()` reads `organizationId`
2. `useQuery` fetches `client.taxRates.list()`
3. Render table with Active/All filter toggle and date-effective columns
4. User clicks "Add Tax Rate" → opens Sheet with empty form
5. User fills form (name, code, rate %, category, effective dates) and submits
6. Form validation checks required fields and rate range (0–100%)
7. On submit: `createMutation` fires with rate converted to basis points
8. On success: invalidate query, close sheet, show toast
9. Edit: click row → pre-fill form → `updateMutation` on submit (code is read-only)
10. Set Default: star button → `setDefaultMutation`
11. Deactivate: button → confirm dialog → `deactivateMutation` (blocked if default)

**Inputs:**
- Form: `name`, `code`, `ratePercent` (user enters "8.00"), `category`, `effectiveFrom` (date), `effectiveUntil` (optional date), `description`, `isDefault`
- Rate stored as basis points (percent × 100)

**State management:**
- TanStack Query: `["taxRates", organizationId]`
- Local state: `sheetOpen`, `editingId`, `form`, `showInactive`
- Form validation: custom checks in `handleSubmit()`

**Outputs:**
- DataTable with columns: Name, Code, Rate, Category, Default (star), Effective From, Effective Until, Status, Actions
- Create/Edit Sheet sidebar
- Empty state with icon if no rates
- Date formatting in "en-MY" locale

**Side effects:**
- Query invalidation on create/update/setDefault/deactivate
- No external API calls beyond tax rate CRUD

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.taxRates.list({ organizationId })` — fetch all rates
- `client.taxRates.create({ organizationId, ...fields })` — create new rate
- `client.taxRates.update({ organizationId, id, ...fields })` — update existing (code omitted)
- `client.taxRates.setDefault({ organizationId, id })` — mark as default
- `client.taxRates.deactivate({ organizationId, id })` — mark inactive

**Uses these components:**
- `DataTable` — render rate list
- `Button`, `Badge`, `Input`, `Textarea`, `Checkbox`, `Select` — form controls
- `Sheet` (sidebar) — create/edit modal
- `Separator`, `EmptyState`, `StatusCallout` — layout
- `lucide-react` icons (Star, Plus, Edit, Tag)

**Uses these hooks:**
- `useUserContext()` — org ID
- `useQuery()` — list rates
- `useMutation()` (×4: create, update, setDefault, deactivate)
- `useQueryClient()` — invalidate on success
- `useState()` — form and UI state

**Navigation: who navigates here:** Settings sidebar
**Navigation: where it goes:** None (modal-based CRUD)

---

## 4. Data Shapes

**DB tables touched:** `taxRates` (multi-tenant per org)
**Key types / Zod schemas:**
```typescript
type TaxCategory = "SST" | "GST" | "service_tax" | "withholding_tax" | "tax_exempt" | "custom";

type TaxRateRow = {
  id: string;
  name: string;
  code: string;
  rateInBasisPoints: number;  // 800 = 8.00%
  category: TaxCategory;
  isDefault: boolean;
  effectiveFrom: string;  // ISO date string
  effectiveUntil: string | null;  // ISO date or null (= active)
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

type FormState = {
  name: string;
  code: string;
  ratePercent: string;  // user-entered "8.00"; parsed to BPS on submit
  category: TaxCategory;
  effectiveFrom: string;  // YYYY-MM-DD for <input type="date">
  effectiveUntil: string;  // YYYY-MM-DD or empty
  description: string;
  isDefault: boolean;
};
```

---

## 5. Tests

**Test files:** `src/__tests__/routes/tax-rates.test.tsx`
**Scenarios covered:**
- Renders without crashing (empty state)
- Shows page heading and "Add Tax Rate" button
- Displays basis points as percentage (800 bps → "8.00%")
- Deactivate button disabled for default tax rate

**Not tested (risk areas):**
- Form validation (required fields, rate range)
- Date range logic (effective until after effective from)
- Code immutability on edit
- Error handling and retry

---

## 6. Notes

**Rate unit conversion:** Form shows percent (user enters "8.00"), API stores basis points (800). Conversion: `Math.round(percent * 100)` on create/update, `bps / 100` on display with `.toFixed(2)`.

**Code immutability on edit:** When editing, the `code` field is disabled and validation skipped (line 272). Codes cannot be changed after creation.

**Effective dates:** `effectiveFrom` is required; `effectiveUntil` is optional. If null, rate is considered "active" (line 388). Date validation ensures `until >= from` (line 694).

**Default constraint:** Cannot deactivate a rate while marked default. The deactivate button is disabled if `isDefault: true` (line 423) with tooltip explaining.

**Status labels:** Active rates show "Active" badge; inactive rates show "Inactive" (lines 395–399).

**Empty state:** Shows "No tax rates" message when list is empty (lines 530–534).

**Date formatting:** Displayed as "en-MY" locale (e.g., "23 Apr 2026"). Helper functions `formatDate()` (line 98) and `toDateInputValue()` (line 112) handle ISO string conversion.

**Error callout:** Uses `StatusCallout` component (line 465) instead of custom card for consistent error UX.

**Stale time:** None set; queries default to 0 (always stale, refetch on mount).
