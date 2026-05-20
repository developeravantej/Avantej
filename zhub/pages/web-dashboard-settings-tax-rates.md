# Tax Configuration

**Route:** `/dashboard/settings/tax-rates`
**Files:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/tax-rates.tsx` — empty route shell (registers route only)
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/tax-rates.lazy.tsx` — `createLazyFileRoute`, all UI + mutations live here

**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Manage tax rates applied to sales orders (SST, GST, service tax, withholding tax, tax exempt, or custom).
**Produces:** A KPI strip (default rate card with amber styling, Active count, Inactive count), Active/All filter toggle, and table of tax rates with CRUD operations + dialog form to create/edit, rate display as percent with basis points indicator.
**On success:** Rate created/updated/deactivated; table refreshes; toast confirmation.
**On failure / error states:** Loading spinner, error card with retry button, form validation toasts.

---

## 2. How It Works

**Execution flow:**
1. Page loads; `useUserContext()` reads `organizationId`
2. `useQuery` fetches `client.taxRates.list()`
3. Render table with Active/All filter toggle and date-effective columns
4. User clicks "New Tax Rate" → opens Dialog with empty form
5. User fills form (name, code, rate %, category, effective dates) and submits
6. Form validation checks required fields and rate range (0–100%)
7. On submit: `createMutation` fires with rate converted to basis points
8. On success: invalidate query, close dialog, show toast (via `useApiMutation`)
9. Edit: click "Edit" → pre-fill form → `updateMutation` on submit (`isDefault` checkbox hidden on edit; code is editable but uppercased)
10. Set Default: star button → `setDefaultMutation` (disabled when row is already default or inactive)
11. Deactivate: button → `deactivateMutation` (button disabled if `isDefault` with title-tooltip explaining)

**Inputs:**
- Form: `name`, `code`, `ratePercent` (user enters "8.00"), `category`, `effectiveFrom` (date), `effectiveUntil` (optional date), `description`, `isDefault`
- Rate stored as basis points (percent × 100)

**State management:**
- TanStack Query: `["taxRates", organizationId]` (invalidated via `useApiMutation`'s `invalidate` option)
- Local state: `sheetOpen`, `editingId`, `form`, `showInactive`
- Form validation: custom checks in `handleSubmit()` (with `toast.error` for each failure)

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
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` (generic table)
- `Button`, `Badge`, `Input`, `Textarea`, `Checkbox`, `Select` — form controls (shadcn/ui)
- `Dialog` (`DialogContent/Header/Title/Description`) — create/edit modal (NOT `Sheet` — switched to Dialog during cleanup)
- `EmptyState`, `StatusCallout`, `PageLoader` — `@/components/ui/*`
- `lucide-react` icons (Star, Plus, Edit, Tag)

**Uses these hooks:**
- `useUserContext()` — org ID
- `useQuery()` — list rates
- `useApiMutation()` (×4: create, update, setDefault, deactivate) — wraps mutate + toast + invalidate
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

**Code on edit:** The `code` field stays editable on edit (auto-uppercased on input); the server's `taxRates.update` accepts a `code`. The earlier "code immutable" rule no longer holds in the UI — verify server-side behaviour before assuming immutability.

**Effective dates:** `effectiveFrom` is required; `effectiveUntil` is optional. If null, rate is considered "active" (line 388). Date validation ensures `until >= from` (line 694).

**Default constraint:** Cannot deactivate a rate while marked default. The deactivate button is disabled if `isDefault: true` with `title` tooltip explaining.

**Status labels:** Active rates show "Active" badge; inactive rates show "Inactive". Status filter band (Active/All buttons) hides inactive rows by default.

**Empty state:** `EmptyState` (Tag icon) with "New Tax Rate" action button when list is empty.

**Date formatting:** Displayed as "en-MY" locale (e.g., "23 Apr 2026"). Helper functions `formatDate()` and `toDateInputValue()` handle ISO string conversion.

**Error callout:** Uses `StatusCallout` with `onRetry={() => refetch()}` for consistent error UX. Plus a separate warning `StatusCallout` in the KPI strip when no default is set.

**Stale time:** None set; queries default to 0 (always stale, refetch on mount).

**Lazy-route split (Phase 5 of web-debt-cleanup):** `tax-rates.tsx` is now a minimal `createFileRoute` stub; all 827 lines of component code live in `tax-rates.lazy.tsx` via `createLazyFileRoute`.
