# Service View

**Route:** `/dashboard/service/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-26

---

## New in this update (2026-05-26)

- **Installment Plans tab added** — new `InstallmentPlansTab` component (`apps/web/src/components/pages/services/installment-plans-tab.tsx`) manages org-level installment plan templates. Card-based UI with filter pills (All / Active / Inactive), a sample-amount calculator, and create/edit/deactivate/reactivate/set-default actions.
- **ServicesPage fully rewritten** — now a bespoke inline table (not DataTable) with: client-side search + category filter pills, sortable columns (Name, Duration, Price, Avg/mo), tri-state bulk-select checkbox, bulk enable/disable action bar, per-row inline `ActiveToggle` switch, hover-revealed Edit + Dupe row actions, and pagination (15 rows/page). Uses `ServiceFormDialogA` and `ServiceDetailDialogA` (the `-a` variant forms).
- **Commission column added to ServicesPage** — shows `defaultCommissionBps` as a percentage; sourced from the batch `services.list` response.
- **Avg/mo column added to ServicesPage** — shows `avgPerMonth` from the batch list response (sortable).
- **Duplicate service** — `services.duplicate` API call added via `duplicateMutation`; creates an inactive draft copy.
- **Route layout reworked** — page now renders on a `bg-[#f3f3f3]` full-bleed background with a page header section (breadcrumb + h1 + description) above the tab pills. Tab navigation uses rounded-full pill buttons instead of underline tabs.
- **Tab `validateSearch` widened** — now accepts any string for `tab`; six valid tab IDs: `services`, `categories`, `rooms`, `promotions`, `pricing`, `installments`.
- **PromotionsPage reworked** — now has search input, reactivate (Enable) button, create-form with `code`/`name`/`type`/`value`/`minimumOrderAmount`/`usageLimits`/dates, and separate edit-form (name/description/dates only — code and type immutable after creation).
- **RoomsPage reworked** — now has Active/All/Inactive filter pills, permission-gated Create Room button, `BranchCombobox` for branch selection, and uses a dedicated `DataTable` from `@/components/tables/rooms/view/data-table`.
- **ServiceCategoriesPage** — now uses `orpc.serviceCategories.list.key()` for cache key (was plain array); adds isError + Retry state. The `DataTable` it renders exposes a "Commission Config" action per row that opens `CategoryCommissionForm`.
- **ServiceCategoryForm (service-category-form.tsx)** — now uses TanStack Form (not React Hook Form); single-submit handler that calls `serviceCategories.create/update` then `serviceCategoryConfig.upsert` in sequence. Fields: name, duration (minutes), maxAttendees, advance-booking rules, cancellation-window rules, buffer time.
- **CategoryCommissionForm** — new form dialog (`apps/web/src/components/forms/category-commission-form.tsx`) for configuring per-category commission: paymentType (fixed/variable), coach slots with weightage bars, max coaches per session, optional conditional rates by attendee count. Calls `categoryCommission.getByCategory` (read) and `categoryCommission.upsert` (write).

---

## 1. What It Does

**Purpose (user perspective):** Browse, create, edit, and manage services; manage service categories, rooms, promotions, pricing overrides, and installment plan templates — all from a single tabbed page.

**Tabs:**
| Tab | Component | Purpose |
|-----|-----------|---------|
| Services | `ServicesPage` | Main service table with search, filter, sort, bulk actions |
| Categories | `ServiceCategoriesPage` | Service category management + commission config |
| Rooms | `RoomsPage` | Room/space management |
| Promotions | `PromotionsPage` | Promotion/discount code management |
| Pricing | `ServicePricingPage` | Branch-level price overrides per service |
| Installment Plans | `InstallmentPlansTab` | Org-level installment plan templates |

Tab state is kept in the URL search param `?tab=` (default: `"services"`). Navigation is via `Route.useNavigate({ search: { tab } })` so the URL is shareable and browser-back-safe.

**Produces:**
- A full-bleed `bg-[#f3f3f3]` page with page header (breadcrumb + h1 + description), rounded-full tab pill bar, and per-tab content area.
- Services tab: inline table with checkbox selection, category filter pills, sortable columns, inline active toggle, hover-revealed edit/dupe actions, pagination footer.
- Categories tab: TanStack Table with search, "Add Category" button, row-click detail dialog, and "Commission Config" action per row.
- Rooms tab: Active/All/Inactive filter pills, create/edit dialog, branch combobox, DataTable.
- Promotions tab: search input, table with code/name/type/value/dates/usage/status columns, create and edit dialogs.
- Pricing tab: service selector dropdown → table of branch price overrides with Expire/Delete actions.
- Installment Plans tab: filter pills + sample-amount input + card grid; create/edit via Dialog, deactivate with impact warning.

**On success:**
- Create/edit service: `ServiceFormDialogA` closes; `orpc.services.list.key()` invalidated.
- Deactivate/activate service (toggle or bulk): same invalidation; toast.
- Duplicate service: `orpc.services.list.key()` invalidated; toast "Service duplicated (inactive draft created)".
- Create/edit category: `orpc.serviceCategories.list.key()` + `orpc.serviceCategoryConfig.getByCategoryId.key()` invalidated; dialog closes.
- Save commission config: `["categoryCommission", organizationId, categoryId]` invalidated; dialog closes.
- Create room: rooms list invalidated; dialog closes.
- Create promotion: `["promotions", organizationId]` invalidated; dialog closes.
- Edit promotion: same invalidation; dialog closes.
- Add price override: `["service-price-overrides", orgId, selectedServiceId]` invalidated; dialog closes.
- Expire/Delete override: same invalidation; confirmation dialog closes.
- Create installment plan: `["installmentPlans", organizationId]` invalidated; dialog closes.
- Deactivate/reactivate/setDefault installment plan: same invalidation.

**On failure / error states:**
- No organization: per-tab "Select an organization to..." message.
- Loading: `PageLoader` spinner per tab.
- isError states: retry buttons (ServicesPage uses `StatusCallout`; others use inline error + retry).
- ServicesPage filter no-match: "No services match this filter."
- Pricing tab, no service selected: dashed-border "Select a service above to view its price overrides."
- Pricing tab, no overrides: "No price overrides configured for this service."
- InstallmentPlansTab: `EmptyState` with "New Plan" action for empty active/all filter; "No inactive plans." for inactive filter.

---

## 2. How It Works

**Execution flow — Services tab:**
```
ServicesTabPage → tab === "services" → <ServicesPage />
  → useUserContext() → organizationId
  → useQuery(orpc.services.list.queryOptions(...)) → rawServices
  → client-side search + category filter + sort + pagination (15/page)
  → inline <table> with HeaderCheckbox (tri-state), SortTh, ActiveToggle
  → row click → setDetailServiceId → <ServiceDetailDialogA>
  → "New Service" → <ServiceFormDialogA mode="create">
  → row "Edit" hover → <ServiceFormDialogA mode="edit">
      → useQuery(["service","edit",editServiceId,organizationId]) → client.services.getById(...)
  → row "Dupe" → duplicateMutation → client.services.duplicate(...)
  → ActiveToggle onChange → client.services.update({ isActive })
  → bulk bar: bulkSetActive → Promise.allSettled(ids.map(update))
```

**Execution flow — Categories tab:**
```
ServicesTabPage → tab === "categories" → <ServiceCategoriesPage />
  → useQuery(orpc.serviceCategories.list.key(...)) → categories
  → <DataTable columns data organizationId>
      → row click → <ServiceCategoryDetailDialog>
      → row "Commission Config" → <CategoryCommissionForm>
          → useQuery(["categoryCommission", orgId, categoryId]) → client.categoryCommission.getByCategory(...)
          → useQuery(["trainerTiers", orgId, "active"]) → client.trainerTiers.list(...)
          → save → client.categoryCommission.upsert(...)
      → "Add Category" → <ServiceFormDialog mode="create">
          → client.serviceCategories.create(...) then client.serviceCategoryConfig.upsert(...)
```

**Execution flow — Rooms tab:**
```
ServicesTabPage → tab === "rooms" → <RoomsPage />
  → useUserContext() → organizationId, hasPermission
  → useQuery(["hierarchyNodes", organizationId]) → nodesData → branches[]
  → useQuery([...orpc.rooms.list.key(), { organizationId, isActive: activeFilter }])
  → <DataTable data onEdit onDeactivate onReactivate>
  → "Create Room" (if canCreate) → Dialog with BranchCombobox
  → createMutation → client.rooms.create(...)
  → updateMutation → client.rooms.update(...)
  → deactivateMutation/reactivateMutation → client.rooms.update({ isActive })
```

**Execution flow — Promotions tab:**
```
ServicesTabPage → tab === "promotions" → <PromotionsPage />
  → useQuery(["promotions", organizationId]) → client.promotions.list(...)
  → client-side search filter (code or name)
  → "New Promotion" → create Dialog (code/name/desc/type/value/minOrder/limits/dates)
      → createPromotion → client.promotions.create(...)
  → row "Edit" → edit Dialog (name/desc/dates only)
      → updatePromotion → client.promotions.update(...)
  → row "Deactivate" → confirm Dialog → deactivatePromotion → client.promotions.deactivate(...)
  → row "Enable" → reactivatePromotion → client.promotions.update({ isActive: true })
```

**Execution flow — Pricing tab:**
```
ServicesTabPage → tab === "pricing" → <ServicePricingPage />
  → useQuery(orpc.services.list.queryOptions(...)) → services for dropdown
  → useQuery(["hierarchy-nodes", organizationId]) → client.hierarchy.listNodes(...) → branchMap
  → selectedServiceId state
  → useQuery(["service-price-overrides", orgId, selectedServiceId])
  → "Add Override" → <ServicePriceOverrideDialog>
  → "Expire" → confirm Dialog → client.services.expireBranchPrice(...)
  → "Delete" → confirm Dialog → client.services.deleteBranchPrice(...)
```

**Execution flow — Installment Plans tab:**
```
ServicesTabPage → tab === "installments" → <InstallmentPlansTab />
  → useQuery(["installmentPlans", organizationId]) → client.installmentPlans.list(...)
  → filter pills: all/active/inactive
  → sampleAmount state (editable RM input)
  → card grid: <PlanCard plan sampleAmount> for each plan
  → "New Plan" → create Dialog (code/name/numInstallments/interval/premium%/desc/isDefault)
  → card "Edit" → edit Dialog (name/numInstallments/interval/premium/desc; code immutable)
  → card "Disable" → deactivate Dialog with active-services impact check
      → client.services.list({ isActive: true }) to count affected services → warning message
      → client.installmentPlans.deactivate(...)
  → card "Enable" → client.installmentPlans.reactivate(...)
  → card "Set default" → client.installmentPlans.setDefault(...)
```

**State management:**
- `tab` in URL search params (TanStack Router `validateSearch`)
- ServicesPage: `search`, `categoryFilter`, `sortKey`, `sortDir`, `page`, `selected` (Set), `isAddOpen`, `isEditOpen`, `isDetailOpen`, `editServiceId`, `detailServiceId`
- PromotionsPage: `search`, `createOpen`, `editOpen`, `editTarget`, `deactivateTarget`, `createForm`, `editForm`
- RoomsPage: `activeFilter`, `isSheetOpen`, `editingRoom`, `form`
- ServicePricingPage: `selectedServiceId`, `addDialogOpen`, `expireConfirmId`, `deleteConfirmId`, `isExpiring`, `isDeleting`
- InstallmentPlansTab: `filter`, `sheetOpen`, `editingId`, `form`, `sampleAmount`, `sampleInput`, `deactivateTarget`, `deactivateWarning`, `deactivateDialogOpen`
- TanStack Query cache for all above

**Inputs:**
- Tab pill clicks → URL search param update
- ServicesPage: search input, category filter pills, sort header clicks, row checkboxes, active toggle, Edit/Dupe row buttons
- Category form: name, duration (minutes), maxAttendees, booking/cancellation rules
- Commission form: paymentType, coach slots (label + weightage%), maxCoaches, conditional toggle, rates by trainer tier
- Room form: name, type, capacity, branchId (via BranchCombobox), isActive (edit only)
- Promotion create form: code, name, description, type, value, minimumOrderAmount, usageLimit, perCustomerLimit, validFrom, validUntil
- Promotion edit form: name, description, validFrom, validUntil
- Price override form: serviceId, branchId, customerType, priceRm, effectiveFrom, effectiveUntil
- Installment plan form: code (create only), name, numInstallments, defaultIntervalDays, pricePremiumPct, description, isDefault (create only)

**Outputs:**
- Services table columns: (checkbox), Service (name + category sub-label), Category (badge), Duration, Price, Commission %, Avg/mo, Active (toggle), Actions (Edit/Dupe)
- Categories table columns: Name, Description, Order, Status, Actions (Commission Config)
- Rooms table: delegated to `@/components/tables/rooms/view/data-table`
- Promotions table columns: Code, Name, Type, Value, Valid From, Valid Until, Usage (count/limit), Status, Actions (Edit/Deactivate|Enable)
- Overrides table columns: Branch, Customer Type, Price, Effective From, Effective Until, Actions (Expire/Delete)
- Installment plan cards: active/inactive badge, ×N badge, interval, default star, name, code, description, sample math block (1/≤4/5+ installments), Edit/Disable|Enable/Set-default actions

**Side effects:**
- `qc.invalidateQueries({ queryKey: orpc.services.list.key() })` on service create/edit/activate/deactivate/duplicate
- `qc.invalidateQueries({ queryKey: orpc.serviceCategories.list.key() })` on category create/edit/deactivate
- `qc.invalidateQueries({ queryKey: orpc.serviceCategoryConfig.getByCategoryId.key() })` on category config upsert
- `qc.invalidateQueries({ queryKey: ["categoryCommission", organizationId, categoryId] })` on commission upsert
- `qc.invalidateQueries({ queryKey: [...orpc.rooms.list.key(), { organizationId }] })` on room create/update
- `qc.invalidateQueries({ queryKey: ["promotions", organizationId] })` on promotion create/update/deactivate
- `qc.invalidateQueries({ queryKey: ["service-price-overrides", orgId, serviceId] })` on override add/expire/delete
- `qc.invalidateQueries({ queryKey: ["installmentPlans", organizationId] })` on plan create/update/deactivate/reactivate/setDefault

---

## 3. What Depends On It

**Calls these API endpoints:**
- `services.list` — list services (includes `defaultCommissionBps`, `avgPerMonth` fields).
- `services.getById` — fetch single service for edit form prefill.
- `services.create` — create new service (via `ServiceFormDialogA`).
- `services.update` — update service fields, toggle isActive, bulk activate/deactivate.
- `services.duplicate` — create inactive draft copy of a service.
- `services.listPriceOverrides` — list branch price overrides for a service.
- `services.setBranchPrice` — create a new branch price override.
- `services.expireBranchPrice` — set effectiveUntil to now on an override.
- `services.deleteBranchPrice` — permanently delete an override.
- `serviceCategories.list` — list categories.
- `serviceCategories.create` — create category.
- `serviceCategories.update` — update or deactivate category.
- `serviceCategories.getById` — fetch single category for edit prefill.
- `serviceCategoryConfig.upsert` — save booking/cancellation rules for a category.
- `serviceCategoryConfig.getByCategoryId` — fetch config for edit prefill.
- `categoryCommission.getByCategory` — fetch commission config for a category.
- `categoryCommission.upsert` — save commission config (slots, rates, conditions).
- `trainerTiers.list` — list active trainer tiers for commission form.
- `rooms.list` — list rooms filtered by isActive.
- `rooms.create` — create room.
- `rooms.update` — update room or toggle isActive.
- `promotions.list` — list promotions.
- `promotions.create` — create promotion.
- `promotions.update` — update promotion (name/desc/dates/isActive).
- `promotions.deactivate` — deactivate promotion.
- `installmentPlans.list` — list installment plans.
- `installmentPlans.create` — create plan.
- `installmentPlans.update` — update plan (name/numInstallments/interval/premium/desc).
- `installmentPlans.setDefault` — mark a plan as default.
- `installmentPlans.deactivate` — deactivate plan.
- `installmentPlans.reactivate` — reactivate plan.
- `hierarchy.listNodes` — fetch hierarchy nodes for branch name maps (Rooms, Pricing tabs).

**Uses these components:**
- `ServicesPage` — `apps/web/src/components/pages/services/services-page.tsx` — bespoke inline table; uses `ServiceFormDialogA` and `ServiceDetailDialogA`.
- `ServiceCategoriesPage` — `apps/web/src/components/pages/services/categories-page.tsx` — renders `DataTable` from `service-category/view/data-table`.
- `RoomsPage` — `apps/web/src/components/pages/services/rooms-page.tsx` — includes `BranchCombobox` (inline component).
- `PromotionsPage` — `apps/web/src/components/pages/services/promotions-page.tsx` — self-contained table + dialogs.
- `ServicePricingPage` — `apps/web/src/components/pages/services/pricing-page.tsx` — branch price override management.
- `InstallmentPlansTab` — `apps/web/src/components/pages/services/installment-plans-tab.tsx` — card-grid installment plan management.
- `ServiceFormDialog` (category form) — `apps/web/src/components/forms/service-category-form.tsx` — TanStack Form; create/edit category + config.
- `CategoryCommissionForm` — `apps/web/src/components/forms/category-commission-form.tsx` — commission config per category.
- `ServiceCategoryDetailDialog` — `apps/web/src/components/forms/service-category-detail-dialog.tsx`.
- `ServicePriceOverrideDialog` — `apps/web/src/components/pages/services/service-price-override-dialog.tsx`.
- `DataTable` (categories) — `apps/web/src/components/tables/service-category/view/data-table.tsx`.
- `DataTable` (rooms) — `apps/web/src/components/tables/rooms/view/data-table.tsx`.
- `ServiceFormDialogA` — `apps/web/src/components/forms/service-form-a.tsx` (the `-a` variant).
- `ServiceDetailDialogA` — `apps/web/src/components/forms/service-detail-dialog-a.tsx` (the `-a` variant).

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId` (and `hasPermission` in RoomsPage).
- `useQuery`, `useMutation`, `useQueryClient` (TanStack Query).
- `useApiMutation` — `apps/web/src/hooks/useApiMutation.ts`.
- `Route.useSearch()`, `Route.useNavigate()` (TanStack Router).
- `useMemo`, `useCallback`, `useRef`, `useState`, `useEffect`.

**Navigation: who navigates here:**
- Sidebar "Business → Services → View Services" link (`apps/web/src/components/app-sidebar.tsx`).

**Navigation: where it goes:** No outbound navigation (all actions open dialogs or switch tabs in-page).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `services` | SELECT / INSERT / UPDATE | `id`, `name`, `categoryId`, `duration`, `durationUnitType`, `maxAttendees`, `branchId`, `isActive`, `price`, `taxable`, `taxPercentage`, `schedulingType`, `sessionCount`, `expirable`, `expiryDays`, `availablePaymentPlans`, `installmentIntervalDays`, `gracePeriodDays`, `timePresetConfig`, `defaultCommissionBps`, `avgPerMonth` |
| `service_categories` | SELECT / INSERT / UPDATE | `id`, `name`, `description`, `displayOrder`, `isActive` |
| `service_category_configs` | SELECT / INSERT / UPDATE | `categoryId`, `defaultDuration`, `defaultMaxAttendees`, `requireAdvanceBooking`, `minAdvanceHours`, `enableCancellationWindow`, `cancellationCutoffHours`, `bufferTimeMinutes` |
| `category_commissions` | SELECT / INSERT / UPDATE | `categoryId`, `paymentType`, `isConditional`, `maxCoaches` |
| `category_commission_slots` | SELECT / INSERT / UPDATE | `slotIndex`, `label`, `weightageBasisPoints` |
| `category_commission_rates` | SELECT / INSERT / UPDATE | `trainerTierId`, `amount` |
| `category_commission_conditions` | SELECT / INSERT / UPDATE | `conditionIndex`, `operator`, `threshold`, `thresholdMax`, `label` |
| `service_price_overrides` | SELECT / INSERT / UPDATE | `id`, `serviceId`, `branchId`, `customerType`, `priceCents`, `effectiveFrom`, `effectiveUntil` |
| `rooms` | SELECT / INSERT / UPDATE | `id`, `name`, `type`, `branchId`, `capacity`, `isActive`, `createdAt`, `updatedAt` |
| `promotions` | SELECT / INSERT / UPDATE | `id`, `code`, `name`, `description`, `type`, `value`, `minimumOrderAmount`, `usageLimit`, `usageCount`, `perCustomerLimit`, `validFrom`, `validUntil`, `isActive`, `branchId` |
| `installment_plans` | SELECT / INSERT / UPDATE | `id`, `code`, `name`, `numInstallments`, `defaultIntervalDays`, `pricePremiumBps`, `description`, `isDefault`, `isActive`, `sortOrder` |
| `hierarchy_nodes` | SELECT | `id`, `name`, `type` |
| `trainer_tiers` | SELECT | `id`, `name` |

**Key types:**
```typescript
// Service row (ServicesPage inline table)
type Service = {
  id: string; name: string | null; categoryId: string | null;
  service_category_name: string | null; duration: number | null;
  durationUnitType: string | null; price: number | null; // cents
  sessionCount: number | null; isActive: boolean | null;
  schedulingType?: string | null; eligibleTrainerTiers?: string[];
  defaultCommissionBps?: number | null; avgPerMonth?: number | null;
};

// Promotion row
interface PromotionRow {
  id: string; code: string; name: string; description: string | null;
  type: "percentage" | "fixed_amount" | "free_item" | "buy_x_get_y";
  value: number; // stored * 100 (e.g. 2000 = 20%)
  minimumOrderAmount: number | null; // cents
  maximumDiscount: number | null; usageLimit: number | null;
  usageCount: number; perCustomerLimit: number | null;
  validFrom: string; validUntil: string | null;
  isActive: boolean; branchId: string | null; createdAt: string;
}

// Installment plan row
type InstallmentPlanRow = {
  id: string; code: string; name: string;
  numInstallments: number; defaultIntervalDays: number;
  pricePremiumBps: number; description: string | null;
  isDefault: boolean; isActive: boolean;
  sortOrder: number; createdAt: string;
};

// Price override row
{
  id: string; serviceId: string; branchId: string | null;
  customerType: "member" | "walk_in" | null;
  priceCents: number; effectiveFrom: Date | null; effectiveUntil: Date | null;
}

// Room row (passed to rooms DataTable)
type RoomRow = {
  id: string; name: string;
  type: "consultation" | "group_session" | "private" | "training" | "individual";
  branchId: string; branchName: string; capacity: number;
  isActive: boolean; createdAt: string | null; updatedAt: string | null;
};
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/service.test.ts` — service-layer unit tests for `listServices`, `getServiceById`, `createService`, `updateService`.

**Scenarios covered:** Service CRUD at the service layer with mock DB.

**Not tested:** Pricing tab interactions, Installment Plans tab CRUD, PromotionsPage create/edit, RoomsPage create/edit, CategoryCommissionForm save, price override create/expire/delete, ServiceDetailDialogA tab rendering, bulk enable/disable, duplicate service, inline active toggle.

---

## 6. Notes

- **Tab routing:** `validateSearch` accepts any string for `tab`; unknown values fall through to the default `<ServicesPage />` case.
- **ServicesPage uses `-a` variant forms:** `ServiceFormDialogA` and `ServiceDetailDialogA` — not the original `ServiceFormDialog` / `ServiceDetailDialog`. The `-a` files are the current canonical implementations.
- **Commission column source:** `defaultCommissionBps` is now returned by the `services.list` batch response — no separate per-row request.
- **Avg/mo column source:** `avgPerMonth` is also returned by `services.list` (computed server-side); sortable client-side.
- **Duplicate is always inactive:** `services.duplicate` creates a copy with `isActive: false`; operator must manually activate the draft.
- **Pricing override branchId sentinel:** `"__org_wide__"` → `null`; `"__all__"` customerType → `null`. Managed inside `ServicePriceOverrideDialog`.
- **Price input:** Override form collects price in RM; `rmToCents()` converts before API call. `formatPrice(row.priceCents)` (no currency arg) used in table display.
- **Expire vs Delete:** Expire sets `effectiveUntil` to now (record preserved). Delete permanently removes the row. Both require a confirmation dialog.
- **Installment plan code immutable:** Code field is disabled in edit mode and cannot be changed after creation.
- **InstallmentPlansTab deactivate impact check:** Before opening the deactivate dialog, fires `client.services.list({ organizationId, isActive: true })` and counts services where `availablePaymentPlans.includes(row.code)`. If > 0, shows a warning paragraph in the confirm dialog.
- **PlanCard sample math:** 1 installment → single block "Due today"; 2–4 → individual blocks per installment; 5+ → compact summary. `pricePremiumBps` is stored as basis points (e.g. 500 = 5%).
- **PromotionsPage value encoding:** `percentage` values stored as `rawValue * 100` (e.g. 20% → 2000). Display reverses: `(value / 100).toFixed(2)%`. `fixed_amount` values are in cents; `rmToCents()` used on input.
- **PromotionsPage edit restrictions:** Code and type cannot be changed after creation — edit dialog only exposes name, description, validFrom, validUntil.
- **CategoryCommissionForm weightage validation:** Slot weightages (in basis points) must sum exactly to 10000 (100%) before save is allowed.
- **ServiceCategoriesPage DataTable** exposes only "Commission Config" as an inline action; Edit and deactivate are inside the row-click `ServiceCategoryDetailDialog`.
- **ServiceFormDialog (service-category-form.tsx)** uses TanStack Form with Zod schema. Two-step submit: create/update category, then upsert config. Both are awaited in the same `mutationFn`.
- **RoomsPage permission gates:** `canCreate` and `canUpdate` from `hasPermission("appointment_management:create/update")`. Create Room button and DataTable edit callback are gated.
- **Route container:** `-m-6 min-h-screen bg-[#f3f3f3] p-6` — negative margin overrides the layout's padding, giving a full-bleed grey background for the whole page.
- **Deactivation is soft delete throughout:** `isActive: false` via `.update()`; no dedicated delete endpoints for services, categories, rooms, or promotions.
- Duration stored in DB in seconds for services; `durationUnitType` controls display conversion in the form.
