# Tax Configuration

**Route:** `/dashboard/settings/tax-rates`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/tax-rates.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Lets admins define, edit, deactivate, and set default tax rates applied to sales orders and invoices.
**Produces:** A filterable table of tax rates with a sliding sheet form for create/edit, inline star button to set default, and deactivate action.
**On success:** Toast notification and query cache invalidated.
**On failure / error states:** Spinner while loading; "Select an organization" prompt; toast errors on mutation failure; client-side form validation before submission.

---

## 2. How It Works

**Execution flow:**
```
TaxRatesPage
  → useUserContext() → organizationId
  → useQuery(["taxRates", organizationId])
      → client.taxRates.list({ organizationId })
  → filter: showInactive toggle (Active | All)
  → columns defined inline (Name, Code, Rate%, Category, Default, EffectiveFrom, EffectiveUntil, Status, Actions)
  → DataTable (sales/view/data-table) — generic table
  → Sheet (create/edit form)
      → createMutation → client.taxRates.create(...)
      → updateMutation → client.taxRates.update(...)
  → setDefaultMutation → client.taxRates.setDefault({ organizationId, id })
  → deactivateMutation → client.taxRates.deactivate({ organizationId, id })
```

**Inputs:** No URL params. Form fields: name, code (uppercase), ratePercent (decimal → stored as basis points), category (select), effectiveFrom (date), effectiveUntil (date, optional), description (textarea), isDefault (checkbox, create only).
**State management:** `useState` for sheet open/close, editingId, form values, showInactive filter. TanStack Query for server state.
**Outputs:** Renders table + filter toolbar; opens Sheet on "Add Tax Rate" or "Edit"; star button triggers setDefault; "Deactivate" triggers soft-delete.
**Side effects:** All mutations invalidate `["taxRates", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `taxRates.list` — fetch all tax rates
- `taxRates.create` — create new rate
- `taxRates.update` — edit existing rate (name, code, rate, category, dates, description)
- `taxRates.setDefault` — mark one rate as the org default
- `taxRates.deactivate` — soft-delete a rate

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic TanStack Table wrapper
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetFooter` — `@/components/ui/sheet` — slide-in create/edit form
- `Badge`, `Button`, `Input`, `Textarea`, `Label`, `Checkbox`, `Select`, `Separator` — `@/components/ui/*`
- `Star`, `Plus`, `Edit`, `Tag` icons — `lucide-react`

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQuery`, `useMutation`, `useQueryClient`
- `useState`

**Navigation: who navigates here:**
- App sidebar → Settings section → "Tax Rates" link (`/dashboard/settings/tax-rates`)
- App sidebar header quick-link also points to this route

**Navigation: where it goes:** Stays on this page.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `tax_rates` | SELECT | `id`, `name`, `code`, `rateInBasisPoints`, `category`, `isDefault`, `isActive`, `effectiveFrom`, `effectiveUntil`, `description`, `createdAt` |
| `tax_rates` | INSERT | all fields above |
| `tax_rates` | UPDATE | `name`, `code`, `rateInBasisPoints`, `category`, `effectiveFrom`, `effectiveUntil`, `description` |
| `tax_rates` | UPDATE | `isDefault` (setDefault) |
| `tax_rates` | UPDATE | `isActive = false` (deactivate) |

**Key types:**
```ts
type TaxCategory = "SST" | "GST" | "service_tax" | "withholding_tax" | "tax_exempt" | "custom";
// rateInBasisPoints: integer (e.g. 800 = 8.00%)
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/tax-rates.test.tsx`

**Scenarios covered:**
- Renders without crashing (empty state)
- Page heading and "Add Tax Rate" button visible
- 800 basis points displays as "8.00%"
- Deactivate button disabled for default rate
- Deactivate button enabled for non-default rate
- Active badge shown for active rates
- Category label mapping (`service_tax` → "Service Tax")
- Active/All filter toggle buttons visible

**Not tested:** Create/update form submission, setDefault mutation, sheet open/close, form validation, error states.

---

## 6. Notes

- Rate is stored as integer basis points (1% = 100 bp). The UI converts: user enters "8.00" → stored as 800.
- `isDefault` is only settable on create via checkbox; editing does not expose this field (use the star button instead).
- Deactivating the default rate is blocked in the UI (button disabled + title tooltip). The service layer silently clears `isDefault` instead of throwing.
- The `effectiveUntil` field shows "Active" text when null.
