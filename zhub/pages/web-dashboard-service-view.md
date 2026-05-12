# Service View

**Route:** `/dashboard/service/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-09

---

## New in this update

- **Pricing tab added** to the top-level tab bar: a new `ServicePricingPage` component (`apps/web/src/components/pages/services/pricing-page.tsx`) manages branch-level price overrides per service. Operators can add, expire, or permanently delete overrides with confirmation dialogs.
- **`ServiceDetailDialog` fully rewritten** with a two-tab layout (Details + Trainers). The Trainers tab uses `serviceMembers.listForService` to show assigned trainers and supports assign/remove via `serviceMembers.assign` / `serviceMembers.remove`. Dialog width changed to `sm:max-w-2xl`.
- **`ServicePriceOverrideDialog`** is a new form dialog (`apps/web/src/components/pages/services/service-price-override-dialog.tsx`) for creating a branch price override: selects service, branch (from hierarchy), customer type, price (RM), effectiveFrom, and optional effectiveUntil.
- **`service-members` router** has a new `listForService` procedure returning `{ memberId, isPrimary, displayName }[]`.
- **`services` router** has two new procedures: `expireBranchPrice` (sets effectiveUntil to now) and `deleteBranchPrice` (permanent delete).

---

## 1. What It Does

**Purpose (user perspective):** Browse, create, edit, and deactivate services; manage service categories, rooms, promotions, and now per-branch price overrides — all from a single tabbed page.

**Tabs:**
| Tab | Component | Purpose |
|-----|-----------|---------|
| Services | `ServicesPage` | Main service CRUD table |
| Categories | `ServiceCategoriesPage` | Service category management |
| Rooms | `RoomsPage` | Room/space management |
| Promotions | `PromotionsPage` | Promotion management |
| Pricing | `ServicePricingPage` | Branch price overrides |

Tab state is kept in the URL search param `?tab=` (default: `"services"`). Navigation is via `Route.useNavigate({ search: { tab } })` so the URL is shareable and browser-back-safe.

**Produces:**
- A full-height card (`h-[calc(100vh-48px)]`) with a sticky tab bar and scrollable content area per tab.
- Service table with name, category, duration, price, sessions, scheduling type, status, and creation date; "Add Service" and per-row edit/detail/deactivate actions via dialogs.
- Pricing tab: a service selector dropdown → table of overrides per service with Branch, Customer Type, Price, Effective From, Effective Until, and Expire/Delete actions.

**On success:**
- Create/edit service: `ServiceFormDialog` closes; `queryClient.invalidateQueries(["services", organizationId])` triggered.
- Deactivate: toast "Service deactivated"; same invalidation.
- Assign trainer: cache key `orpc.serviceMembers.listForService.key(...)` invalidated; toast "Trainer assigned".
- Remove trainer: same invalidation; toast "Trainer removed".
- Add price override: `["service-price-overrides", organizationId, selectedServiceId]` invalidated; dialog closes.
- Expire/Delete override: same invalidation; confirmation dialog closes.

**On failure / error states:**
- No organization: "Select an organization to view services." (Pricing tab) / "Select an organization to manage pricing."
- Loading: centered spinner (combined `servicesLoading || categoriesLoading`) or inline loader per tab.
- DataTable empty state: "No services yet. Add one to get started."
- Pricing tab, no service selected: dashed-border empty state "Select a service above to view its price overrides."
- Pricing tab, no overrides: "No price overrides configured for this service."

---

## 2. How It Works

**Execution flow — Services tab:**
```
ServicesTabPage (route component)
  → Route.useSearch() → tab
  → tab === "services" → <ServicesPage />
      → useUserContext() → organizationId
      → useQuery(["services", organizationId]) → client.services.list(...)
      → useQuery(["serviceCategories", organizationId]) → client.serviceCategories.list(...)
      → <DataTable> (service CRUD)
          → row detail click → ServiceDetailDialog
              → useEffect: client.services.getById(...)
              → Tabs: "details" | "trainers"
              → "trainers" tab → <TrainersTab>
                  → useQuery(orpc.serviceMembers.listForService.queryOptions(...))
                  → useQuery(orpc.members.list.queryOptions(...))
                  → Select unassigned member → Assign button → client.serviceMembers.assign(...)
                  → Remove button per row → client.serviceMembers.remove(...)
          → "Add Service" / row edit → ServiceFormDialog
          → row deactivate → client.services.update({ isActive: false })
```

**Execution flow — Pricing tab:**
```
ServicesTabPage → tab === "pricing" → <ServicePricingPage />
  → useUserContext() → organizationId
  → useQuery(orpc.services.list.queryOptions(...)) → services for dropdown
  → useQuery(["hierarchy-nodes", organizationId]) → listNodes → branchMap
  → selectedServiceId state (from dropdown)
  → useQuery(["service-price-overrides", orgId, selectedServiceId])
      → client.services.listPriceOverrides({ organizationId, serviceId })
  → "Add Override" button → <ServicePriceOverrideDialog>
      → form: serviceId, branchId (__org_wide__ → null), customerType (__all__ → null),
               priceRm (rmToCents conversion), effectiveFrom (datetime-local), effectiveUntil (optional)
      → client.services.setBranchPrice(...)
      → onSuccess → invalidate overrides cache
  → "Expire" row button → confirm dialog → client.services.expireBranchPrice({ organizationId, priceId })
  → "Delete" row button → confirm dialog → client.services.deleteBranchPrice({ organizationId, priceId })
```

**State management:**
- `tab` in URL search params (TanStack Router `validateSearch`)
- `selectedServiceId` local state in `ServicePricingPage`
- `addDialogOpen`, `expireConfirmId`, `deleteConfirmId`, `isExpiring`, `isDeleting` local state in `ServicePricingPage`
- TanStack Query cache for services, categories, service-members, price-overrides, hierarchy nodes

**Inputs:**
- Tab clicks → URL search param update
- Service form fields: name, duration, duration unit, expirable, price, sessions, taxable, tax %, category, sessionCount, expiryDays, availablePaymentPlans, installmentIntervalDays, schedulingType, maxAttendees
- Trainer assign: member select dropdown
- Price override form: service, branch, customer type, price (RM), effectiveFrom, effectiveUntil

**Outputs:**
- Services table columns: Name, Category, Duration, Price (RM X.XX), Sessions, Scheduling type badge, Status badge, Created date
- Overrides table columns: Branch, Customer Type, Price, Effective From, Effective Until, Actions (Expire/Delete)

**Side effects:**
- `queryClient.invalidateQueries(["services", organizationId])` on create/edit/deactivate
- `queryClient.invalidateQueries({ queryKey: orpc.serviceMembers.listForService.key(...) })` on trainer assign/remove
- `queryClient.invalidateQueries({ queryKey: ["service-price-overrides", orgId, serviceId] })` on override add/expire/delete

---

## 3. What Depends On It

**Calls these API endpoints:**
- `services.list` — list services in accessible scope; requires `service_management:read`.
- `services.getById` — fetch single service for detail/edit; requires `service_management:read`.
- `services.create` — create new service; requires `service_management:create`.
- `services.update` — update service fields or deactivate (`isActive: false`); requires `service_management:update`.
- `services.listPriceOverrides` — list branch price overrides for a service.
- `services.setBranchPrice` — create a new branch price override.
- `services.expireBranchPrice` — set effectiveUntil to now on an override.
- `services.deleteBranchPrice` — permanently delete an override.
- `serviceCategories.list` — list categories for service form dropdown.
- `serviceMembers.listForService` — list assigned trainers for a service; returns `{ memberId, isPrimary, displayName }[]`.
- `serviceMembers.assign` — assign a member as trainer to a service.
- `serviceMembers.remove` — remove a trainer assignment from a service.
- `members.list` — list all org members for the assign-trainer dropdown.
- `hierarchy.listNodes` — fetch hierarchy nodes to build the branch name map for the pricing table and override form.

**Uses these components:**
- `ServicesPage` — `apps/web/src/components/pages/services/services-page.tsx` — main service CRUD page.
- `ServiceCategoriesPage` — `apps/web/src/components/pages/services/categories-page.tsx` — categories management.
- `RoomsPage` — `apps/web/src/components/pages/services/rooms-page.tsx` — rooms management.
- `PromotionsPage` — `apps/web/src/components/pages/services/promotions-page.tsx` — promotions management.
- `ServicePricingPage` — `apps/web/src/components/pages/services/pricing-page.tsx` — **NEW**: branch price override management.
- `ServicePriceOverrideDialog` — `apps/web/src/components/pages/services/service-price-override-dialog.tsx` — **NEW**: create price override form dialog.
- `ServiceDetailDialog` — `apps/web/src/components/forms/service-detail-dialog.tsx` — **REWRITTEN**: now has Details + Trainers tabs; `sm:max-w-2xl`.
- `DataTable` — `apps/web/src/components/tables/service/view/data-table.tsx`.
- `columns` — `apps/web/src/components/tables/service/view/columns.tsx`.
- `ServiceFormDialog` — `apps/web/src/components/forms/service-form.tsx`.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `useQuery`, `useMutation`, `useQueryClient` (TanStack Query).
- `Route.useSearch()`, `Route.useNavigate()` (TanStack Router).

**Navigation: who navigates here:**
- Sidebar "Business → Services → View Services" link (`apps/web/src/components/app-sidebar.tsx`).

**Navigation: where it goes:** No outbound navigation (all actions open dialogs or switch tabs in-page).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `services` | SELECT / INSERT / UPDATE | `id`, `name`, `categoryId`, `duration`, `durationUnitType`, `maxAttendees`, `branchId`, `isActive`, `title`, `description`, `imageUrl`, `type`, `price`, `priceUnit`, `taxable`, `taxPercentage`, `isRecommended`, `location`, `features`, `schedulingType`, `sessionCount`, `expirable`, `expiryDays`, `expiryDate`, `availablePaymentPlans`, `installmentIntervalDays`, `timePresetConfig` |
| `service_categories` | SELECT | `id`, `name` |
| `service_price_overrides` | SELECT / INSERT / UPDATE | `id`, `serviceId`, `branchId`, `customerType`, `priceCents`, `effectiveFrom`, `effectiveUntil` |
| `service_members` | SELECT / INSERT / DELETE | `serviceId`, `memberId`, `isPrimary` |
| `members` | SELECT | `id`, `name`, `email` (for assign dropdown) |
| `hierarchy_nodes` | SELECT (via getDescendantNodeIds + listNodes) | `id`, `parentId`, `name`, `type` |

**Key types:**
```typescript
// Service (partial, used in table)
{
  id: string; name: string; categoryId?: string | null;
  duration: number; durationUnitType?: string | null;
  maxAttendees: number; branchId?: string | null;
  isActive: boolean; price?: number | null; // cents
  schedulingType?: "appointment" | "class_slot" | null;
  sessionCount?: number | null; expirable?: boolean; taxable?: boolean;
  taxPercentage?: number | null; createdAt: Date | string;
  timePresetConfig?: { recurringDays: string[]; timeSlotsPerDay: Record<string, string[]> } | null;
}

// Trainer entry from serviceMembers.listForService
{ memberId: string; isPrimary: boolean; displayName: string }

// Price override row from services.listPriceOverrides
{
  id: string; serviceId: string; branchId: string | null;
  customerType: "member" | "walk_in" | null;
  priceCents: number; effectiveFrom: Date | null; effectiveUntil: Date | null;
}
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/service.test.ts` — service-layer unit tests for `listServices`, `getServiceById`, `createService`, `updateService`.

**Scenarios covered:** Service CRUD at the service layer with mock DB.

**Not tested:** Pricing tab interactions, Trainers tab assign/remove flows, price override create/expire/delete, ServiceDetailDialog tab rendering, DataTable row interactions.

---

## 6. Notes

- **Tab routing:** `validateSearch` in the route coerces any unknown `tab` param to the default `"services"`. Navigating via `Route.useNavigate({ search: { tab } })` preserves other search params and does a replace-style push.
- **Pricing override branchId sentinel:** The form uses `"__org_wide__"` as a sentinel value in the Select; this is converted to `null` before calling the API. Similarly `"__all__"` for customerType → `null`.
- **Price input:** The override form collects price in RM (decimal string), then converts via `rmToCents()` from `@/lib/money` before submitting. `formatPrice(row.priceCents)` (no currency arg) is used in the table display.
- **Expire vs Delete:** Expire sets `effectiveUntil` to the current timestamp (override is no longer active but record is preserved). Delete permanently removes the row.
- **TrainersTab unassigned filter:** Members already in `assigned` set are excluded from the assign dropdown using `assignedIds` Set. When all members are assigned, the Select shows "All members assigned" and is disabled.
- **Commission % field removed (2026-04-22):** Services no longer have a `commissionPercentage` field. Commission is configured per service category via `categoryCommission.upsert`.
- **Deactivation is soft delete:** `services.update({ isActive: false })` — no dedicated delete endpoint.
- Duration stored in DB in seconds; `durationUnitType` controls display unit conversion in the form.
- `DataTable` columns typed as `ColumnDef<any>` — type safety not enforced at the column level.
- The `ServiceDetailDialog` loads service data via an imperative `useEffect` + `client.services.getById(...)` (not TanStack Query), so it does not participate in the query cache.
