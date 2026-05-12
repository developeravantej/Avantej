# Installment Plans

**Route:** `/dashboard/settings/installment-plans`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage installment payment plans (e.g., "6 monthly payments") offered to customers on package services.
**Produces:** Table of active/inactive plans with CRUD operations, form to create/edit, deactivation dialog with service impact warning.
**On success:** Plan created/updated/deactivated; table refreshes; toast confirmation.
**On failure / error states:** Loading spinner, error card with retry button, form validation toasts.

---

## 2. How It Works

**Execution flow:**
1. Page loads; `useUserContext()` reads `organizationId`
2. `useQuery` fetches `client.installmentPlans.list()`
3. Render table with Active/All filter toggle
4. User clicks "Add Plan" → opens Sheet with empty form
5. User fills form and clicks "Add Plan" → `createMutation` fires
6. On success: invalidate query, close sheet, show toast
7. Edit: click row → pre-fill form → `updateMutation` on submit
8. Deactivate: click button → check if services reference this plan via `client.services.list()` → show warning dialog → confirm → `deactivateMutation`

**Inputs:**
- Form: `code` (immutable on edit), `name`, `numInstallments`, `defaultIntervalDays`, `pricePremiumPct`, `description`, `isDefault`
- Premium stored as basis points (percent × 100)

**State management:**
- TanStack Query: `["installmentPlans", organizationId]`
- Local state: `sheetOpen`, `editingId`, `form`, `showInactive`, `deactivateTarget`, `deactivateWarning`, `deactivateDialogOpen`
- Form validation: custom checks in `handleSubmit()`

**Outputs:**
- DataTable with columns: Name, Code, Installments, Interval (days), Premium, Default (star), Status, Actions
- Create/Edit Sheet sidebar
- Deactivate confirmation dialog with service impact warning

**Side effects:**
- `client.services.list()` called on deactivate to compute warning message
- Query invalidation on create/update/setDefault/deactivate
- Navigation triggered by open/closeSheet functions

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.installmentPlans.list({ organizationId })` — fetch all plans
- `client.installmentPlans.create({ organizationId, ...fields })` — create new plan
- `client.installmentPlans.update({ organizationId, id, ...fields })` — update existing (code omitted)
- `client.installmentPlans.setDefault({ organizationId, id })` — mark as default
- `client.installmentPlans.deactivate({ organizationId, id })` — mark inactive
- `client.services.list({ organizationId, isActive: true })` — fetch to warn about plan usage

**Uses these components:**
- `DataTable` — render plan list
- `Button`, `Badge`, `Input`, `Textarea`, `Checkbox` — form controls
- `Sheet` (sidebar), `Dialog` (deactivate warning) — modals
- `Separator`, `EmptyState` — layout
- `lucide-react` icons (Star, Plus, Edit, CreditCard)

**Uses these hooks:**
- `useUserContext()` — org ID
- `useQuery()` — list plans
- `useMutation()` (×4: create, update, setDefault, deactivate)
- `useQueryClient()` — invalidate on success

**Navigation: who navigates here:** Settings sidebar
**Navigation: where it goes:** None (modal-based CRUD)

---

## 4. Data Shapes

**DB tables touched:** `installmentPlans` (multi-tenant per org)
**Key types / Zod schemas:**
```typescript
type InstallmentPlanRow = {
  id: string;
  code: string;
  name: string;
  numInstallments: number;
  defaultIntervalDays: number;
  pricePremiumBps: number;  // basis points
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

type FormState = {
  code: string;
  name: string;
  numInstallments: string;  // controlled input; parsed on submit
  defaultIntervalDays: string;
  pricePremiumPct: string;  // as percent (e.g., "0.50" for 0.5%)
  description: string;
  isDefault: boolean;
};
```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):**
- Form validation (especially numeric parsing)
- Premium conversion (percent ↔ basis points)
- Deactivate warning logic (services check may fail gracefully)
- Edge case: deactivate a plan used by 0 active services

---

## 6. Notes

**Code immutability on edit:** When editing, the `code` field is disabled (line 549) and validation skipped (line 227). This enforces immutable codes post-creation.

**Premium unit:** Form shows percent (0.50 = 0.5%), but API stores basis points (50 = 0.5%). Conversion: `Math.round(pct * 100)` on create/update, `bps / 100` on display.

**Deactivate with warning:** When user clicks deactivate, the component fetches all active services, filters for those with `availablePaymentPlans` array containing the plan's code, and shows a count-based warning (line 268–271). If the fetch fails, warning is skipped silently.

**Default plan constraint:** Cannot deactivate a plan while it's marked default; `setDefault()` must be called first. The deactivate button is implicitly disabled when `isDefault: true` (star button takes precedence).

**Empty state:** Shows "No installment plans" message with icon and description when list is empty.
