# Settings — Installment Plans

**Route:** `/dashboard/settings/installment-plans`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Permission guard:** `service_management:*` (read/update/delete — enforced server-side in `installmentPlansRouter`)
**Last updated:** 2026-04-18

---

## 1. What It Does

**Purpose (user perspective):** Admin-only CRUD page for configuring the tenant's installment payment plans. Replaces the hardcoded `full | half | quarterly` enum — admins can now define custom plans (e.g. "Monthly — 6 payments") that become available across the service form and native purchase flow.
**Produces:** DataTable listing all installment plans. Each row shows name, code, number of installments, default interval in days, **price premium %**, default-flag star, active/inactive badge, and Edit / Deactivate action buttons. A right-side Sheet hosts the create and edit form. A confirmation Dialog handles deactivation (with a warning when the plan is referenced by services).
**On success:** Toast messages on create / update / setDefault / deactivate. List query invalidated and refetched.
**On failure / error states:** Validation errors via form field helpers; server errors surface as toast messages (`BAD_REQUEST` for unknown code, invalid `numInstallments`, etc.).

---

## 2. How It Works

**Execution flow:**
```
InstallmentPlansPage
  → useUserContext() → organizationId
  → useState(sheetOpen, editingId, form, showInactive, deactivate* state)
  → useQuery(installmentPlans.list) → client.installmentPlans.list({ organizationId })
  → filters rows client-side by isActive flag when showInactive is false

  → "Add Plan" → setEditingId(null) + reset form → openSheet
  → row "Edit" → setEditingId(row.id) + prefill form → openSheet
  → Sheet form fields: code (disabled on edit), name, numInstallments (int), defaultIntervalDays (int), pricePremiumPct (0–100, stored as bps), description, isDefault (create-only)
  → Submit → useMutation(installmentPlans.create | installmentPlans.update)
  → row star button → useMutation(installmentPlans.setDefault)
  → row "Deactivate" → setDeactivateTarget(row) → openDialog
       → fetches services list to compute "referenced by N services" warning string
  → Dialog "Confirm" → useMutation(installmentPlans.deactivate)

  → onSuccess (any mutation) → invalidateQueries(["installmentPlans", organizationId]) + toast.success()
```

**Inputs:** No URL params. All state local.
**State management:** `useState` for sheetOpen, editingId, form, showInactive toggle, deactivateTarget, deactivateWarning, deactivateDialogOpen. TanStack Query for list + 4 mutations.
**Outputs:** Create / Update / SetDefault / Deactivate mutations.
**Side effects:** Cache key `["installmentPlans", organizationId]` invalidated after each mutation. Deactivation that targets the current default silently clears `isDefault` at the service layer (matches `deactivateTaxRate` pattern).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `installmentPlans.list` — fetches all plans (active + inactive) scoped to tenant; ordered by `sortOrder` asc, then `code`
- `installmentPlans.create` — inserts new plan; service enforces `numInstallments >= 1`, `pricePremiumBps` 0–10000, and unique `code`; if `isDefault=true` clears prior defaults in a single transaction
- `installmentPlans.update` — updates name / numInstallments / defaultIntervalDays / pricePremiumBps / description / isActive / sortOrder. `code` is immutable; attempts are silently ignored
- `installmentPlans.setDefault` — makes a plan the default, clearing other defaults
- `installmentPlans.deactivate` — sets `isActive = false`; silently clears `isDefault` if it was set
- `services.list` — used only when opening the deactivate dialog to compute the "referenced by N services" warning

All procedures are `protectedProcedure` under `service_management` resource (actions: read / update / delete).

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx`
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` — shadcn/ui
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` — shadcn/ui (deactivate confirmation)
- `Button`, `Input`, `Label`, `Textarea`, `Badge`, `Checkbox`, `Separator` — shadcn/ui primitives
- `Star`, `Plus`, `Edit`, `CreditCard` icons — lucide-react

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQueryClient` — for query invalidation
- `useState` — page-local UI state (Sheet, Dialog, form)

**Navigation: who navigates here:**
- App sidebar → Config section → "Installment Plans" link (alongside Tax Rates)

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `installment_plans` | SELECT / INSERT / UPDATE | `id`, `code`, `name`, `numInstallments`, `defaultIntervalDays`, `pricePremiumBps`, `description`, `isActive`, `isDefault`, `sortOrder` |
| `services` | SELECT | `id`, `availablePaymentPlans` — read to warn before deactivating a referenced plan |

**Schema** (`packages/db/src/schema/tenant/installment-plans.ts`):
```typescript
installment_plans (
  id uuid PK,
  code text UNIQUE NOT NULL,       // e.g. 'full', 'half', 'quarterly', 'monthly_6'
  name text NOT NULL,              // display label
  num_installments integer NOT NULL,  // >= 1
  default_interval_days integer NOT NULL DEFAULT 30,
  price_premium_bps integer NOT NULL DEFAULT 0,  // basis points; 0 = none, 1000 = 10%, max 10000
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```
Seeded on migration `0017_installment_plans`. Column `price_premium_bps` added in `0018_installment_plan_premium` (additive ALTER with DEFAULT 0 — backfill-safe). Both embedded in `packages/db/src/migrate-tenant.ts`:
- `full` → 1 installment, is_default=true
- `half` → 2 installments
- `quarterly` → 4 installments

Seed uses `ON CONFLICT (code) DO NOTHING` — idempotent.

**Form fields (client-side):**
- `code` — text, required, immutable on edit. Plain string (lowercase snake_case convention, but not enforced)
- `name` — text, required
- `numInstallments` — string-controlled integer input; parsed on submit; service rejects `< 1`
- `defaultIntervalDays` — string-controlled integer input; parsed on submit
- `pricePremiumPct` — string-controlled decimal input (0–100, accepts `10.5`); converted to bps on submit via `Math.round(pct * 100)`; service rejects bps outside `[0, 10000]`
- `description` — optional textarea
- `isDefault` — checkbox (only shown on create; edit uses the row star button via `setDefault` mutation)

---

## 5. Tests

**Test files:**
- Unit: `apps/server/src/tests/unit/services/installment-plan.test.ts` — 21 tests covering CRUD, default-flag transaction semantics, immutable-code enforcement, deactivation side effects
- Integration: `apps/server/src/tests/integration/installment-plans.integration.test.ts` — full oRPC CRUD + permission matrix (runs only when `TENANT_DATABASE_URL` is set)

**Not tested:** Page-level RTL tests for the Sheet/Dialog flows.

---

## 6. Notes

- `code` is immutable after creation — the backend silently ignores attempts to change it on update. A rename would orphan any historical `package_instances.paymentPlanType` references.
- Permission resource reused: `service_management` (not a new `installment_plan_management`). Rationale: existing `installments` router already scopes admin ops under `service_management`, and the precedent set by `tax_configuration` (added to the resource type union but never seeded into the permissions table) would silently break non-admin access. Future v2 can split to a dedicated resource with a proper seed migration.
- `isDefault` currently has no consumer — reserved for future UX ("pre-select default plan in native"). Toggling it still enforces single-row-at-a-time semantics in service-layer transaction.
- Deactivate warning reads `services.availablePaymentPlans` arrays to count references. Does NOT block deactivation — only warns. Orphan codes on historical instances render via the raw-code string transform on the installments view.
- Native app (`apps/native/app/(app)/dashboard/buy-package/plan.tsx`) still uses a hardcoded `PLAN_CONFIG` as of 2026-04-17 — not yet synced with this dynamic data source. Backend continues to accept legacy codes (`full/half/quarterly`) without issue.
- **Price premium** (added 2026-04-18): a plan-level markup (0–100%, stored as bps) that the server applies in `packageInstances.create` when the plan is selected. Callers send the BASE price; server scales to `base × (10000 + bps) / 10000`. Premium is NOT retroactive — historical `package_instances.total_price` rows are untouched when a premium is added to a plan. Customer-facing surfaces (native purchase flow, web service view) do not yet show premium — only the web admin "Assign Package" form.
