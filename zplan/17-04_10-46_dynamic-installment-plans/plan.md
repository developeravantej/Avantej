# Dynamic Installment Plans + Installments View Filters

**Date:** 2026-04-17
**Branch:** Customer-app
**Author:** Planning session (advisor-reviewed)

---

## 1. Overview

### Problem
Installment plan types (`full`, `half`, `quarterly`) are hardcoded across 3 apps and 7 files:
- Backend enum at `packages/services/src/installment.service.ts:204-209` maps code → installment count.
- Zod enum at `packages/api/src/routers/package-instances.ts:169,224` and `packages/api/src/routers/services.ts:171,286`.
- Web service form at `apps/web/src/components/forms/service-form.tsx:22,611-631` (hardcoded checkboxes + labels).
- Native purchase flow at `apps/native/app/(app)/dashboard/buy-package/plan.tsx:20-28` (hardcoded `PLAN_CONFIG`).
- Native payment step at `apps/native/app/(app)/dashboard/buy-package/pay.tsx:341-352` (hardcoded "half ? 2 : 4").

The admin Installments view at `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx` has status tabs but no search, date-range, or plan filters.

### Goals
1. Make installment plans admin-configurable per tenant via a new `installment_plans` table.
2. Add search (clientId / purchaseNumber), date-range (nextDueDate), and plan filters to the admin Installments view.
3. Zero behavior change for existing `full/half/quarterly` rows — fully backwards compatible.

### Success criteria
- An admin can create a custom plan (e.g. "Monthly (6 payments)") via a Settings page, enable it on a service, and a customer can purchase that service with the new plan in the native app — producing 6 installments with the correct schedule.
- The admin Installments view supports filtering by clientId prefix, purchaseNumber, date range, and plan code — independently and in combination.
- Existing historical `package_instances` rows remain readable and functional (no data migration required).

### Scope in
- Tenant-scoped `installment_plans` table + seed migration
- CRUD service + router + settings UI for plans
- Dynamic plan rendering in web service form and native purchase flow
- New filters on `installments.adminOverview`
- Type check + test updates

### Scope out (non-goals, explicit)
- Customer name search (deferred; would require cross-DB join into users)
- Multi-currency per plan
- Per-plan grace period override (services own grace period)
- UI for editing individual installment amounts per plan (plans only define structure)
- Renaming the existing `paymentPlanType` column (stays as free-form text storing the plan code)

---

## 2. Result (What Changes for the User)

### Role: Franchise Admin / Org Admin

**Before:**
- Payment plans are locked to 3 options: Full, Half, Quarterly. If the business wants a 6-month monthly plan, they can't offer it without engineering work.
- The Installments view shows a list with status tabs (All / Active / Overdue / Locked) but no way to search for a specific customer or narrow by date.

**After:**
- A new "Installment Plans" page under Settings where the admin can create/edit/deactivate installment plans — e.g. "Monthly (6 payments)", "Weekly (12 payments)".
- The service form's "Payment Plans" section now shows whatever active plans exist in the tenant (not the hardcoded 3).
- The Installments view gains three new filters:
  - Search box (debounced) matching clientId prefix or exact purchaseNumber
  - Date-range picker on "Next Due Date"
  - Plan dropdown (populated from the tenant's active plans)

### Role: Customer (Native App)
**Before:** Plan selection screen shows exactly Full / Half / Quarterly (filtered by what the service allows).
**After:** Plan selection screen shows whatever plans the service has enabled — could be 2 of the built-ins plus a custom "Monthly (6)". The schedule logic correctly produces N installments based on the selected plan's `numInstallments`.

### Key differences
- New sidebar link: Settings → Installment Plans
- Service form's Payment Plans section becomes dynamic (checkboxes driven by API)
- Installments view header gets a search input + date range + plan-code dropdown
- Native "Plan" screen renders cards from fetched data, not a hardcoded `PLAN_CONFIG` map

---

## 3. Technical Architecture

### Data model — new table

**`installment_plans`** (tenant DB)

```typescript
// packages/db/src/schema/tenant/installment-plans.ts
import {
  pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const installmentPlans = pgTable(
  "installment_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stable short identifier — MUST match existing literal values ('full','half','quarterly')
    code: text("code").notNull(),
    name: text("name").notNull(),                       // display name
    numInstallments: integer("num_installments").notNull(), // >= 1 (enforced in service)
    defaultIntervalDays: integer("default_interval_days").notNull().default(30),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeIdx: uniqueIndex("installment_plans_code_idx").on(t.code),
    activeIdx: index("installment_plans_active_idx").on(t.isActive),
    defaultIdx: index("installment_plans_default_idx").on(t.isDefault),
  }),
);
```

**Migration seed** — inserts 3 rows exactly matching existing literals (invariant: downstream code reads `paymentPlanType` as `code`, so mismatch silently orphans historical rows):

```sql
INSERT INTO installment_plans (code, name, num_installments, default_interval_days, sort_order, is_default)
VALUES
  ('full', 'Full Payment', 1, 30, 0, true),
  ('half', 'Half (2 installments)', 2, 30, 10, false),
  ('quarterly', 'Quarterly (4 installments)', 4, 30, 20, false)
ON CONFLICT (code) DO NOTHING;
```

### Schema decisions (already agreed with user)
1. **`package_instances.paymentPlanType` stays as `text`** storing the plan CODE. Not a uuid FK. Historical rows readable; null still means "no installment plan" (legacy semantic preserved — see `installment.service.ts:394`).
2. **Search scope v1**: `ilike` on `clientId` (prefix match) and exact `purchaseNumber` only. No cross-DB name join.
3. **Interval precedence**: `effectiveInterval = service.installmentIntervalDays ?? plan.defaultIntervalDays`. Resolved in `package-instances.ts` at the `createInstallmentSchedule` call site.

### Permission resource
**Reuse `service_management`** (not a new `installment_plan_management`). Rationale:
- Existing `packages/api/src/routers/installments.ts` already scopes admin ops under `service_management:read/update`.
- `tax_configuration` resource was added to the type union but **never seeded into `permissions` table** — verified via grep. Non-admin roles can't access tax-rates unless admin fallback (priority ≥ 100). Same trap applies to a new resource.
- Reuse keeps sibling routers consistent and avoids a permission-seed migration.
- Future v2 can split to `installment_plan_management` with a proper seed migration; tracked in Open Questions.

### API contract — new router

**`packages/api/src/routers/installment-plans.ts`** (modeled on `tax-rates.ts`)

```typescript
installmentPlans: {
  list: input({ organizationId, activeOnly?: boolean })
        → output: InstallmentPlan[]    // ordered by sortOrder asc, then code

  getById: input({ organizationId, id: uuid })
           → output: InstallmentPlan

  getByCode: input({ organizationId, code: string })
             → output: InstallmentPlan | null    // for native app resolution

  create: input({ organizationId, code, name, numInstallments, defaultIntervalDays, description?, isDefault?, sortOrder? })
          → output: InstallmentPlan
          // service enforces: numInstallments >= 1, code unique, setDefault clears other defaults in tx

  update: input({ organizationId, id, ...partial })
          → output: InstallmentPlan
          // code is immutable on update (to prevent orphaning existing paymentPlanType refs)

  setDefault: input({ organizationId, id })
              → output: InstallmentPlan

  deactivate: input({ organizationId, id })
              → output: InstallmentPlan
              // silently clears isDefault if the deactivated plan was default (tax-rates pattern)
}
```

### API contract — extended `installments.adminOverview`

Add three optional inputs to the existing procedure:
```typescript
search: z.string().optional(),           // matches clientId prefix OR exact purchaseNumber
dueBefore: z.string().datetime().optional(),
dueAfter: z.string().datetime().optional(),
paymentPlanCode: z.string().optional(),  // filters package_instances.paymentPlanType
```
Passed through to `getAdminInstallmentOverview` in `packages/services/src/installment.service.ts:656-710`. Where-clause additions:
```typescript
if (search) conditions.push(or(ilike(packageInstances.clientId, `${search}%`), eq(packageInstances.purchaseNumber, search)));
if (dueBefore) conditions.push(lte(packageInstances.nextDueDate, new Date(dueBefore)));
if (dueAfter) conditions.push(gte(packageInstances.nextDueDate, new Date(dueAfter)));
if (paymentPlanCode) conditions.push(eq(packageInstances.paymentPlanType, paymentPlanCode));
```

### API contract — breaking changes to existing routers

**`packages/api/src/routers/services.ts`** lines 171, 286:
```typescript
// Before
availablePaymentPlans: z.array(z.enum(["full", "half", "quarterly"])).optional(),
// After
availablePaymentPlans: z.array(z.string()).optional(),
```
Handler validates each code exists in `installment_plans` where `isActive = true`; rejects unknown codes with `BAD_REQUEST`.

**`packages/api/src/routers/package-instances.ts`** lines 169, 201, 224, 237:
```typescript
// Before
paymentPlanType: z.enum(["full", "half", "quarterly"]).nullable().optional(),
installmentsTotal: input.paymentPlanType === "half" ? 2 : input.paymentPlanType === "quarterly" ? 4 : 1,
await createInstallmentSchedule({ paymentPlanType: input.paymentPlanType!, intervalDays: input.installmentIntervalDays ?? 30, ... });

// After
paymentPlanType: z.string().nullable().optional(),  // plan code
// handler body:
let planRow = null;
if (input.paymentPlanType) {
  planRow = await ctx.tenantDb.query.installmentPlans.findFirst({
    where: and(eq(installmentPlans.code, input.paymentPlanType), eq(installmentPlans.isActive, true)),
  });
  if (!planRow) throw new ORPCError("BAD_REQUEST", { message: `Unknown installment plan: ${input.paymentPlanType}` });
}
const installmentsTotal = planRow?.numInstallments ?? 1;
const isInstallmentPlan = planRow && planRow.numInstallments > 1;
// ... createPackageInstance with same paymentPlanType text
// Interval precedence rule:
const effectiveInterval = input.installmentIntervalDays ?? planRow?.defaultIntervalDays ?? 30;
await createInstallmentSchedule({ installmentsTotal, intervalDays: effectiveInterval, ... });
```

**`packages/services/src/installment.service.ts`** lines 186-209 — `CreateInstallmentScheduleParams`:
```typescript
// Before
paymentPlanType: "full" | "half" | "quarterly";
// After
installmentsTotal: number;   // caller resolves from plan
```
Remove hardcoded `planToTotal` map (line 204-209).

---

## 4. User Journeys

### Journey A — Admin configures a new plan
**Trigger:** Admin wants to offer a 6-payment monthly plan.
**Where it lives:** New route `/dashboard/settings/installment-plans` (modeled on existing `settings/tax-rates` page).
**Steps:**
1. Admin clicks **Sidebar → Settings → Installment Plans** → lands on `installment-plans.tsx` page
2. Page shows list of existing plans (3 seeded rows: Full, Half, Quarterly) in a DataTable
3. Admin clicks **Add Plan** button → Sheet opens from right with a form
4. Fills: `code = monthly_6`, `name = "Monthly (6 payments)"`, `numInstallments = 6`, `defaultIntervalDays = 30`, `description = "Pay over 6 months"`, saves
5. Sheet closes, toast "Plan created successfully", new row appears in the list
6. Admin navigates to **Services** page, opens a package service, the "Payment Plans" checkbox section now shows 4 options including `monthly_6`
7. Admin enables `monthly_6`, saves service → toast confirms

### Journey B — Customer purchases with a custom plan (native)
**Trigger:** Customer picks a package service that has `monthly_6` enabled.
**Where it lives:** Existing native purchase flow (`apps/native/app/(app)/dashboard/buy-package/plan.tsx`).
**Steps:**
1. Customer completes setup/schedule/info steps → lands on Plan step
2. Plan step fetches active installment plans via oRPC, filters by `service.availablePaymentPlans` → renders 4 cards (Full, Half, Quarterly, Monthly 6)
3. Customer selects "Monthly (6 payments)" → continues
4. Pay step reads `numInstallments = 6` from flow context → shows schedule breakdown
5. Purchase submits → backend creates `package_instance` with `paymentPlanType = 'monthly_6'` + 6 installments at 30-day intervals
6. Admin opens Installments view → new row appears, plan badge reads "Monthly (6 payments)" (from plan.name), `installmentsTotal = 6`

### Journey C — Admin filters the Installments view
**Trigger:** Admin wants to find overdue payments for a specific customer on the quarterly plan.
**Where it lives:** Existing `packages/installments/view.tsx`.
**Steps:**
1. Admin navigates to **Packages → Installments**
2. Page loads with all installment package instances (current behavior preserved)
3. Admin types `"a3f9"` in new search box → table filters via debounced query to clientId prefix match
4. Admin picks date range `2026-05-01` → `2026-06-01` in new date-range picker → filter narrows further
5. Admin picks "Quarterly (4 installments)" from new plan dropdown → list shows only matching rows
6. Admin clicks **Clear filters** → returns to full view
7. Combining a filter with the existing status tab (e.g. "Overdue") still works

---

## 5. Phased Implementation

### Phase 1 — Schema + backend CRUD (delivers Journey A backend)

**Dependencies:** none

#### Task 1.1 — New tenant schema file
- **File (new):** `packages/db/src/schema/tenant/installment-plans.ts`
- **File (modify):** `packages/db/src/schema/tenant/index.ts` — add `export * from "./installment-plans";`
- **Acceptance:** `bun check-types` passes; `tenantSchema` type includes `installmentPlans`.

#### Task 1.2 — Generate + embed migration
- Run `bun db:generate` (tenant config) → new file `packages/db/src/migrations/tenant/0012_<name>.sql`
- Copy the generated SQL into `packages/db/src/migrate-tenant.ts` as `MIGRATION_0012_INSTALLMENT_PLANS` string constant
- Append seed SQL (see §3) to the same constant — runs as part of the migration tx
- Add entry to `TENANT_MIGRATIONS` array (after existing `0011_installments` block at line 1875)
- Run `bun db:push` on the dev DB to apply
- Verify via Drizzle Studio: 3 rows exist with codes `full`, `half`, `quarterly`
- **Acceptance:** Fresh tenant DB provisioning applies the migration + seed; `LATEST_MIGRATION_VERSION` updates.

#### Task 1.3 — Service layer
- **File (new):** `packages/services/src/installment-plan.service.ts`
- Functions: `listInstallmentPlans({ activeOnly })`, `getInstallmentPlanById`, `getInstallmentPlanByCode`, `createInstallmentPlan`, `updateInstallmentPlan`, `setDefaultInstallmentPlan`, `deactivateInstallmentPlan`
- Rules:
  - `numInstallments` must be `>= 1` (throw `Error` otherwise)
  - `code` immutable on update
  - `setDefault` clears existing defaults in a single transaction (tax-rates pattern: `tax-rates.service.ts:124-145`)
  - `deactivate` silently clears `isDefault` if it was set (matches `deactivateTaxRate`)
- **File (modify):** `packages/services/src/index.ts` — re-export new service
- **Acceptance:** `bun check-types` passes.

#### Task 1.4 — Router
- **File (new):** `packages/api/src/routers/installment-plans.ts` — mirror structure of `packages/api/src/routers/tax-rates.ts`
- Use `service_management` as permission resource (not new `installment_plan_management`)
- Actions:
  - `list, getById, getByCode` → `service_management:read`
  - `create, update, setDefault` → `service_management:update` (no separate `create` action used for plans since the UI is one Sheet for create + edit)
  - `deactivate` → `service_management:delete`
- **File (modify):** `packages/api/src/routers/index.ts` — import + register `installmentPlans: installmentPlansRouter` in `baseRouter` (add after `installments:` at line 103)
- **Acceptance:** Frontend `client.installmentPlans.list({...})` resolves via TS type inference; `bun check-types` passes.

#### Task 1.5 — Unit + integration tests
- **File (new):** `apps/server/src/tests/unit/services/installment-plan.test.ts`
  - Create: valid inputs, reject `numInstallments < 1`, reject duplicate code
  - Update: reject mutation of `code` field
  - setDefault: clears other defaults in same tx
  - Deactivate: clears isDefault flag when active default is deactivated
- **File (new):** `apps/server/src/tests/integration/installment-plans.integration.test.ts` — full CRUD via oRPC
- **Acceptance:** `cd apps/server && bun test:unit` and `bun test:integration` pass; new tests cover all CRUD + permission paths.

**Phase 1 acceptance criteria:**
- `bun check-types` passes
- `bun test:unit` + `bun test:integration` pass
- Seeded rows visible in dev DB via Drizzle Studio
- `client.installmentPlans.list({ organizationId })` returns 3 seeded plans when called from a typed client

---

### Phase 2 — Swap plan resolution in installment creation

**Dependencies:** Phase 1 complete

#### Task 2.1 — Refactor `createInstallmentSchedule` signature
- **File (modify):** `packages/services/src/installment.service.ts:186-209`
- Change `CreateInstallmentScheduleParams.paymentPlanType: "full"|"half"|"quarterly"` → `installmentsTotal: number`
- Remove hardcoded `planToTotal` map (lines 204-209)
- Use `params.installmentsTotal` directly in loop at line 216
- **Acceptance:** Function signature compiles; caller resolves `installmentsTotal` upstream.

#### Task 2.2 — Update `package-instances.ts` router
- **File (modify):** `packages/api/src/routers/package-instances.ts`
- Line 169: Zod enum → `z.string()`
- Lines 200-240 (`create` handler): fetch plan by code from `installmentPlans` table, derive `installmentsTotal`, apply interval precedence rule (`service.installmentIntervalDays ?? plan.defaultIntervalDays ?? 30`), pass `installmentsTotal` into `createInstallmentSchedule`
- Reject unknown / inactive plan codes with `ORPCError("BAD_REQUEST")`
- **Acceptance:** Existing behavior for `full`/`half`/`quarterly` produces identical schedules (manual: create a test instance with `paymentPlanType: "half"` — result has 2 installments at the service's intervalDays).

#### Task 2.3 — Update `services.ts` router validation
- **File (modify):** `packages/api/src/routers/services.ts:171,286`
- Zod enum → `z.array(z.string())`
- In `create` + `update` handlers: if `input.availablePaymentPlans` provided, validate each code exists in `installmentPlans` (isActive = true). Reject unknown codes with `BAD_REQUEST`.
- **Acceptance:** Setting `availablePaymentPlans: ["unknown_code"]` returns 400.

#### Task 2.4 — Update existing installment unit tests
- **File (modify):** `apps/server/src/tests/unit/services/installment.test.ts`
- Line 138: test passes `paymentPlanType: "half"` → change test setup to pass `installmentsTotal: 2` directly (since we moved resolution up a layer)
- Line 124, 162: `paymentPlanType: string | null` field on `makePackage` stays (semantic: "is installment plan" still = `paymentPlanType !== null`)
- Verify `installment.service.ts:394` null-check semantic remains: `pkg.paymentPlanType === null` still means "legacy / not installment".
- **Acceptance:** `cd apps/server && bun test src/tests/unit/services/installment.test.ts` passes.

#### Task 2.5 — Scan for other enum references (from advisor's blindspot #4)
- Grep `paymentPlanType\|availablePaymentPlans\|'full'\|'half'\|'quarterly'` across these test files:
  - `apps/server/src/tests/unit/services/sales-order.test.ts`
  - `apps/server/src/tests/unit/services/waitlist.test.ts`
  - `apps/server/src/tests/unit/services/class-slots.test.ts`
  - `apps/server/src/tests/integration/org.test.ts`
  - `apps/server/src/tests/integration/walk-in-customers.integration.test.ts`
  - `apps/server/src/tests/integration/purchase-orders.integration.test.ts`
  - `apps/server/src/tests/integration/expenses.integration.test.ts`
- Update any that mock the enum shape. Most are likely incidental matches on the word `full` (not the enum).
- **Acceptance:** Full `bun test` runs clean.

**Phase 2 acceptance criteria:**
- `bun check-types` passes
- All backend tests pass
- Full native purchase flow in simulator still creates a package_instance + installments correctly for `full`, `half`, `quarterly` (verifies the existing native client works against the new backend — compatibility check deliberate)
- **No user-visible change yet** (intentional — this is a refactor)

---

### Phase 3 — Settings UI (delivers Journey A end-to-end via web)

**Dependencies:** Phase 1 complete (can parallelize with Phase 4)

#### Task 3.1 — Installment Plans settings page
- **File (new):** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx`
- Clone structure of `settings/tax-rates.tsx` (adapt columns, form fields)
- Columns: `name`, `code` (mono badge), `numInstallments`, `defaultIntervalDays`, `isDefault` (star button), `isActive`, actions (Edit, Deactivate)
- Create/Edit Sheet: fields for `code` (disabled on edit), `name`, `numInstallments` (integer min 1), `defaultIntervalDays` (integer min 1), `description`, `isDefault` checkbox (only on create)
- Deactivate button: if the plan code is currently referenced by any service's `availablePaymentPlans`, show warning before confirming (fetch services list first)
- Route guard: `beforeLoad: async () => { await requirePermission("service_management:update"); }`
- **Acceptance:** Page loads, CRUD ops work, toast messages on success/error (matches tax-rates UX).

#### Task 3.2 — Sidebar link
- **File (modify):** `apps/web/src/components/app-sidebar.tsx`
- Add link under Settings section (alongside "Tax Rates") pointing to `/dashboard/settings/installment-plans`
- **Acceptance:** Link visible; clicking navigates to the new page.

#### Task 3.3 — Make service form payment plans dynamic
- **File (modify):** `apps/web/src/components/forms/service-form.tsx`
- Line 22: `availablePaymentPlans: Array<'full'|'half'|'quarterly'>` → `availablePaymentPlans: string[]`
- Lines 75-77, 104-106: `.some(p => p !== 'full')` logic — **change semantic**: plan is "installment" if its `numInstallments > 1`. Load plans via `useQuery(client.installmentPlans.list({ organizationId, activeOnly: true }))` and compute `isInstallmentSelected = selectedPlans.some(code => plansMap.get(code)?.numInstallments > 1)`
- Lines 611-631: replace hardcoded `['full','half','quarterly'] as const` with `activePlans` from the query
- **Line 628 (advisor blindspot #2):** replace hardcoded label ternary with `plan.name` from the fetched plan record
- Line 129, 156, 178: default `availablePaymentPlans: []` — unchanged
- **Acceptance:** Create a new plan `monthly_6` → service form checkbox list shows 4 options; toggling it preserves existing form state.

#### Task 3.4 — Fix type cast on services data table
- **File (modify):** `apps/web/src/components/tables/service/view/data-table.tsx:100`
- Change cast from `Array<'full'|'half'|'quarterly'>` to `string[]`
- **Acceptance:** `bun check-types` passes.

**Phase 3 acceptance criteria (manual in browser):**
- User creates a plan `monthly_6` from Settings → Installment Plans
- Opens a package service in the service form → `monthly_6` appears as a checkbox
- Enables it, saves service → `service.availablePaymentPlans` contains `monthly_6` in DB
- Attempts to deactivate the `monthly_6` plan → warning shows "currently used by N services"

---

### Phase 4 — Installments view filters (delivers Journey C)

**Dependencies:** Phase 1 complete (parallelizable with Phase 3 — needs only the `installmentPlans.list` endpoint)

#### Task 4.1 — Extend `adminOverview` service + router
- **File (modify):** `packages/services/src/installment.service.ts:656-710` (`getAdminInstallmentOverview`)
  - Add `search?: string`, `dueBefore?: Date`, `dueAfter?: Date`, `paymentPlanCode?: string` to `AdminInstallmentOverviewParams`
  - Apply where conditions from §3 API contract
- **File (modify):** `packages/api/src/routers/installments.ts:194-234` (`adminOverview`)
  - Add the 4 new inputs to Zod schema
  - Pass through (converting datetime strings to `Date` objects)
- **Acceptance:** Typed client accepts new params; responses narrow correctly.

#### Task 4.2 — Add filter UI to Installments view
- **File (modify):** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx`
- Add state: `searchQuery`, `dueBefore`, `dueAfter`, `planCode`
- Add `useDebounce` wrapper around `searchQuery` (300ms; hook at `@/hooks/useDebounce` per MEMORY)
- Add `useQuery(client.installmentPlans.list({ organizationId, activeOnly: true }))` for the plan dropdown + label resolution
- Include all 4 filter values in `useQuery` queryKey + `adminOverview` input
- Render filter row (above status tabs): search `<Input>`, two `<Input type="date">`, plan `<Select>`, "Clear" button
- Plan-badge rendering (line 325): look up `plan.name` via `plansMap.get(row.paymentPlanType)`; fall back to the existing string-transform if not found (handles orphan codes from deactivated plans)
- **Acceptance:** Each filter works independently and in combination; clearing returns full list.

**Phase 4 acceptance criteria (manual in browser):**
- Type a real clientId prefix → list narrows
- Pick a due-date range → list narrows further
- Pick a plan from dropdown → list narrows to matching plan codes
- All filters compose with existing status tabs

---

### Phase 5 — Native app sync (delivers Journey B)

**Dependencies:** Phases 1–3 complete

#### Task 5.1 — Dynamic plan cards on Plan step
- **File (modify):** `apps/native/app/(app)/dashboard/buy-package/plan.tsx`
- Lines 20-28: remove hardcoded `PLAN_CONFIG`
- Add `useQuery(client.installmentPlans.list({ organizationId, activeOnly: true }))`
- Filter fetched plans by `state.availablePaymentPlans` (the service's enabled codes)
- Render card per plan: `plan.name`, `plan.numInstallments`, plan.description as secondary text
- Preserve auto-skip semantic: if only 1 plan is available AND that plan has `numInstallments === 1`, skip the screen (change `availablePlans.length === 1 && availablePlans[0] === "full"` to `onlyPlan && onlyPlan.numInstallments === 1`)
- **Acceptance:** Plans load from API; selecting any renders correctly.

#### Task 5.2 — Pipe `numInstallments` through purchase flow
- **File (modify):** `apps/native/contexts/purchase-flow-context.tsx`
  - Line 27: `paymentPlanType: "full"|"half"|"quarterly"|null` → `paymentPlanType: string | null`
  - Add new field: `numInstallments: number | null` (set when plan selected)
  - Line 53: initialize `paymentPlanType: null, numInstallments: null`
- **File (modify):** `apps/native/app/(app)/dashboard/buy-package/plan.tsx` — when selecting a plan, call `update({ paymentPlanType: plan.code, numInstallments: plan.numInstallments })`
- **File (modify):** `apps/native/app/(app)/dashboard/buy-package/pay.tsx`
  - Line 77: `paymentPlanType: state.paymentPlanType ?? "full"` — unchanged
  - Lines 329-352: replace hardcoded `state.paymentPlanType === "half" ? 2 : 4` with `state.numInstallments ?? 1`
- **File (check):** `apps/native/app/(app)/dashboard/buy-package/setup.tsx:171` — already reads `selectedSvc.availablePaymentPlans`, no change.
- **Acceptance:** Native purchase flow renders + submits correctly for built-in + custom plans.

**Phase 5 acceptance criteria (manual on simulator):**
- Create `monthly_6` plan on web (Phase 3) + enable on a service
- Open native app as test customer, pick that service
- Plan screen shows 4 options; pick "Monthly (6 payments)"
- Pay screen shows schedule = 6 installments
- Submit → DB shows `paymentPlanType = 'monthly_6'`, 6 installment rows, `installmentsTotal = 6`

---

### Phase 6 — Cleanup

**Dependencies:** Phases 2–5 complete

#### Task 6.1 — Remove dead code
- Verify no remaining literals `"full"|"half"|"quarterly"` in enum/union positions (stringly-typed references in display / default logic are fine)
- Run `bun check` (Biome) — fix any warnings introduced
- Run `bun check-types`

#### Task 6.2 — Update zhub docs
- Run `/hub-update` to regenerate affected page docs:
  - `zhub/pages/web-dashboard-packages-installments-view.md` (filters section)
  - `zhub/pages/web-dashboard-packages-instances-view.md`
  - `zhub/pages/native-buy-package-plan.md`
  - `zhub/pages/native-buy-package-pay.md`
  - New: `zhub/pages/web-dashboard-settings-installment-plans.md`
- Update `zhub/index.md` with the new Settings page

#### Task 6.3 — Full verification
- `bun check-types` — clean
- `cd apps/server && bun test` — all green
- Manual walkthrough of Journeys A, B, C against dev DB (franchisee@gmail.com / password123 on org `996febce-aaad-4ded-8f47-02d2b566c8ee`)

**Phase 6 acceptance criteria:**
- Clean builds, clean tests
- Hub docs reflect the new feature
- All 3 journeys demonstrable end-to-end

---

## 6. Impact & Breakage Analysis

### Callers of `paymentPlanType` (verified via grep)
| File | Line(s) | Usage | Breaks if changed? |
|------|---------|-------|---------------------|
| `packages/db/src/schema/tenant/package-instances.ts` | 60 | Column definition | Keep — stays as `text` |
| `packages/api/src/routers/package-instances.ts` | 169, 201, 223, 237 | Zod enum, resolution logic | Modified in Phase 2 |
| `packages/services/src/installment.service.ts` | 191, 209, 394, 665 | Schedule creation, null-check, filter | Lines 191/209 refactored; 394/665 preserved (null-check semantic) |
| `packages/services/src/appointment.service.ts` | 219 | `pkg.paymentPlanType !== null` check | Unchanged (semantic preserved) |
| `packages/services/src/package-instance.service.ts` | 45, 130 | Field pass-through | Unchanged (it's `string \| null` already) |
| `apps/native/contexts/purchase-flow-context.tsx` | 27, 53 | State type | Widened to `string \| null` |
| `apps/native/app/(app)/dashboard/buy-package/plan.tsx` | 51, 57, 66 | Selection logic | Refactored in Phase 5 |
| `apps/native/app/(app)/dashboard/buy-package/pay.tsx` | 77, 329, 341, 352 | Display + installment count | Refactored in Phase 5 |
| `apps/web/src/routes/...packages/installments/view.tsx` | 325, 481 | Display transform | Replaced with `plan.name` lookup in Phase 4 |
| `apps/server/src/tests/unit/services/installment.test.ts` | 124, 138, 162 | Test fixtures | Updated in Phase 2 |

### Callers of `availablePaymentPlans` (verified via grep)
| File | Line(s) | Usage | Breaks if changed? |
|------|---------|-------|---------------------|
| `packages/db/src/schema/tenant/services.ts` | 80 | Column definition | Unchanged (`text[]`) |
| `packages/api/src/routers/services.ts` | 171, 245, 286, 378 | Zod enum, pass-through | Zod widened in Phase 2 |
| `apps/web/src/components/forms/service-form.tsx` | 22, 75-77, 104-106, 129, 156, 178, 616-622, 628, 633, 650 | Type + checkbox UI + gating | Refactored in Phase 3 |
| `apps/web/src/components/tables/service/view/data-table.tsx` | 100 | Type cast | Widened in Phase 3 |
| `apps/native/app/(app)/dashboard/buy-package/setup.tsx` | 171 | Pass-through | Unchanged (reads raw `string[]`) |
| `apps/native/app/(app)/dashboard/buy-package/plan.tsx` | 39 | Filter source | Unchanged (still reads `string[]` from state) |

### Return-type changes
- `createInstallmentSchedule` signature changes from `paymentPlanType` → `installmentsTotal`. **Only callers:**
  - `packages/api/src/routers/package-instances.ts:232` (modified in Phase 2)
  - Tests in Phase 2
- `getAdminInstallmentOverview` return shape **unchanged** — only params added. No caller break.
- `adminOverview` router return **unchanged** — only input params added. Frontend defaults all new params to undefined on first load.

### Deployment coupling matrix
| Phase | Ships independently? | Blocks on |
|-------|----------------------|-----------|
| 1 (schema + CRUD) | ✅ Yes (no callers) | — |
| 2 (plan resolution swap) | ❌ Must ship with 1 | Phase 1 |
| 3 (settings UI) | ✅ Can ship after 1 | Phase 1 |
| 4 (filters) | ✅ Can ship after 1 | Phase 1 |
| 5 (native) | ❌ Can deploy after 2, but safest after 3 lets admins create custom plans to test | Phases 1, 2 |
| 6 (cleanup) | ✅ | All prior |

**Safe deploy order:** 1 → 2 → (3 ∥ 4) → 5 → 6. Phases 3 and 4 parallelize cleanly; the only shared touchpoint is the `installmentPlans.list` endpoint from Phase 1.

**Critical coupling:** Phase 2 widens the Zod input from enum to string. This is **backward compatible** (enum values are valid strings), so the old native client will continue to work against the new backend — which is exactly what we verify at the end of Phase 2.

### Blocking prerequisites
None. All 3 key design decisions resolved by user. Migration + seed is idempotent.

### Nullable/optional field assumptions preserved
- `package_instances.paymentPlanType` is **nullable** — `null` = "no installment plan" (legacy rows). Phase 2 preserves this semantic exactly. The `installment.service.ts:394` null-check (`pkg.paymentPlanType === null`) remains valid.
- `package_instances.creditsUnlocked` is **nullable** — null = legacy "all credits available". Unchanged.
- `services.availablePaymentPlans` is `text[] DEFAULT '{}'` — empty array = "no installment plans available on this service" (customer sees only Full in native). Unchanged.

---

## 7. Cross-Cutting Concerns

### Error handling
- Unknown plan code submitted to `services.update`: return `BAD_REQUEST` with `"Unknown installment plan: {code}"`
- Unknown plan code submitted to `packageInstances.create`: same error at handler
- Orphan plan code in display (plan was deactivated but still referenced on historical instance): UI falls back to raw-code display with a subtle `(inactive)` suffix (installments view Phase 4; service form just shows the code).
- `numInstallments < 1` in create/update: service throws; router converts to `BAD_REQUEST`

### Testing strategy
- **Unit**: new `installment-plan.service.test.ts`; updates to `installment.test.ts`
- **Integration**: new `installment-plans.integration.test.ts` (full CRUD + permission matrix); existing `installments` integration tests re-run to prove no regression
- **Type safety**: `bun check-types` gates every phase
- **Manual (CLAUDE.md rule — UI not done until tested in browser)**:
  - Phase 3: create/edit/deactivate plan; verify label updates in service form
  - Phase 4: type search, pick dates, pick plan; combine with status tabs
  - Phase 5: native simulator — custom plan produces correct schedule

### Migration plan
- Tenant migration `0012_installment_plans.sql` is idempotent: `CREATE TABLE` + `INSERT ... ON CONFLICT DO NOTHING`
- Applied to existing tenant branches via `runTenantMigrations` on next provisioning trigger (or manual `bun db:push` in dev)
- **No data migration** for historical `package_instances.paymentPlanType` — existing values `'full'|'half'|'quarterly'` match seed codes exactly (advisor blindspot #1 — invariant enforced by seed SQL)
- Existing `services.availablePaymentPlans` arrays preserve their values. UI handles gracefully.

### Rollback strategy
- **Phase 1**: drop `installment_plans` table; revert services/index.ts + routers/index.ts
- **Phase 2**: revert the 3 router files + `installment.service.ts` diff. Old enum is valid again.
- **Phase 3/4**: revert the web page/component diffs (zero backend impact)
- **Phase 5**: revert native code + context diff
- Since schema is additive and enum→string is widening, rollback is localized per phase.

### Performance considerations
- Plan lookup on every `packageInstances.create` adds 1 DB roundtrip. Acceptable (rare operation). Optional future optimization: cache active plans in-context.
- `adminOverview` filters use existing indexes:
  - `package_instances_client_idx` — clientId prefix
  - `package_instances_next_due_date_idx` — date range
  - `package_instances_purchase_number_idx` — exact match
  - `paymentPlanType` has no index today. If admin filter performance suffers (unlikely — tenant-scoped, limit 200), add `CREATE INDEX ON package_instances (payment_plan_type)` in a follow-up.
- `installment_plans.list` fires once per page load on 3 pages (settings, service form, installments view); list is small (< 20 typical) — no caching needed.

---

## 8. Open Questions / Risks

### Open questions (deferred, non-blocking)
1. **Split to dedicated `installment_plan_management` permission resource?** (v2 consideration — requires a permission-seed migration; deferred per advisor feedback since `tax_configuration` sets a precedent of relying on admin fallback without seeding)
2. **Customer name search in Installments view?** Would require joining tenant `members` or cross-DB `users` lookup. Out of scope.
3. **Allow plan editing of `numInstallments` after creation?** Today the plan says immutable code; what about numInstallments? If a plan is in use, changing numInstallments retroactively would desync historical schedules. Recommend: lock numInstallments once any `package_instance.paymentPlanType` references the code. Flag for discussion during Phase 1 implementation.

### Risks + mitigations
1. **Migration ordering in `migrate-tenant.ts`** — easy to forget embedding the new migration. Mitigation: Task 1.2 explicitly requires the array append; Phase 1 acceptance criterion includes "fresh provisioning applies 0012 + seed."
2. **Seed code mismatch** — if someone seeds `'Full'` instead of `'full'`, historical rows with `paymentPlanType='full'` become orphaned. Mitigation: seed SQL uses exact lowercase literals in plan doc; code review enforces.
3. **Native rebuild** — changes to native require an Expo rebuild. Mitigation: call out to user during Phase 5 kickoff; ensure dev env operational before touching native.
4. **Orphan codes on deactivated plan** — UI falls back to raw-code display. Mitigation: deactivation confirmation dialog warns if code is in active service (Phase 3).
5. **Default plan semantics** — the `isDefault` flag exists but is not yet consumed anywhere. Not a blocker; reserved for future UX (e.g., "pre-select default plan in native"). Mitigation: document as future extension.
6. **Test credentials** — `franchisee@gmail.com / password123` for tenant role; test org ID `996febce-aaad-4ded-8f47-02d2b566c8ee`. From MEMORY. Confirm valid before Phase 3 manual verification.

---

## 9. File Summary

### New files (7)
- `packages/db/src/schema/tenant/installment-plans.ts`
- `packages/services/src/installment-plan.service.ts`
- `packages/api/src/routers/installment-plans.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx`
- `apps/server/src/tests/unit/services/installment-plan.test.ts`
- `apps/server/src/tests/integration/installment-plans.integration.test.ts`
- `packages/db/src/migrations/tenant/0012_<name>.sql` (drizzle-generated)

### Modified files (12)
- `packages/db/src/schema/tenant/index.ts`
- `packages/db/src/migrate-tenant.ts`
- `packages/services/src/installment.service.ts`
- `packages/services/src/index.ts`
- `packages/api/src/routers/installments.ts`
- `packages/api/src/routers/package-instances.ts`
- `packages/api/src/routers/services.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx`
- `apps/web/src/components/forms/service-form.tsx`
- `apps/web/src/components/tables/service/view/data-table.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/native/contexts/purchase-flow-context.tsx`
- `apps/native/app/(app)/dashboard/buy-package/plan.tsx`
- `apps/native/app/(app)/dashboard/buy-package/pay.tsx`
- `apps/server/src/tests/unit/services/installment.test.ts`

### Total surface
~25 files touched across 3 apps + 3 packages. Estimated 2-3 dev-days for a single engineer sequentially; 1.5-2 dev-days with Phases 3+4 parallelized.
