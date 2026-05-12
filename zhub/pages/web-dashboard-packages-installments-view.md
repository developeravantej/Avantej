# Installment Packages

**Route:** `/dashboard/packages/installments/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Permission guard:** `service_management:read` (via `requirePermission` in `beforeLoad`)
**Last updated:** 2026-04-17

---

## 1. What It Does

**Purpose (user perspective):** Admin view to oversee all installment-based package instances across the organization — tracking payment progress, overdue status, locked accounts, and allowing manual payment confirmation, unlock, and refund.
**Produces:** Filterable table of package instances on installment plans with status tabs (All / Active / Overdue / Locked) plus a filter row with debounced search (clientId prefix / exact purchase number), due-date range pickers, and a plan-code dropdown. Clicking "View" opens a slide-over with a full installment timeline and action buttons.
**On success:** Mutations (confirm payment, unlock, refund) refresh the list and detail data; success toasts shown.
**On failure / error states:** Full-page spinner while loading list; error toasts on mutation failure; "Select an organization" guard.

---

## 2. How It Works

**Execution flow:**
```
InstallmentsViewPage
  → useUserContext() → organizationId
  → useState(statusFilter, searchQuery, dueBefore, dueAfter, planCode)
  → useDebounce(searchQuery, 300) → debouncedSearch
  → useQuery(installmentPlans.list) → client.installmentPlans.list({ organizationId, activeOnly: true })
  → plansMap: Map<code, plan> (memoized) — drives Plan Type badge label + Plan dropdown options
  → useQuery(installments.adminOverview) → client.installments.adminOverview({
        organizationId, status, limit: 50, offset: 0,
        search: debouncedSearch || undefined,
        dueBefore/dueAfter: ISO datetime strings | undefined,
        paymentPlanCode: planCode,
     })
  → renders filter row (Search input, Due After / Before date inputs, Plan <Select>, Clear button)
  → renders DataTable with Client ID, Plan Type (via plansMap.get(code)?.name), Credits, Progress, Next Due Date, Status, View button
  → "View" → openSheet(instance) → selectedInstance state
  → useQuery(installments.listByPackageInstance) → client.installments.listByPackageInstance({ organizationId, packageInstanceId })
  → Sheet shows installment timeline table + action buttons
  → "Confirm Payment" → Dialog → useMutation(installments.confirmPayment)
  → "Manual Unlock" → Dialog → useMutation(installments.manualUnlock)
  → "Process Refund" → Dialog → useMutation(installments.processRefund)
```

**Inputs:** No URL params. All filters (status / search / due-before / due-after / planCode) are local state.
**State management:** `useState` for statusFilter, searchQuery, dueBefore, dueAfter, planCode, selectedInstance, sheetOpen, three dialog open flags, and form fields (paymentMethod, notes, nextIntervalDays, unlockReason, refundAmount, refundReason). `useDebounce(searchQuery, 300)` from `@/hooks/useDebounce`. `useMemo` for plansMap. TanStack Query for list, plans, and per-instance installments.
**Outputs:** Three mutations with cache invalidation.
**Side effects:** Cache keys `["installments-overview", orgId]` and `["installments-by-instance", orgId, instanceId]` invalidated after each mutation.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `installments.adminOverview` — paginated list of package instances with installment plan info (limit 50). Accepts filters: `status`, `search` (clientId prefix OR exact purchaseNumber), `dueBefore` / `dueAfter` (ISO datetime strings), `paymentPlanCode`
- `installments.listByPackageInstance` — individual installment records for a selected instance; also triggers `evaluateAndLockIfOverdue` server-side
- `installments.confirmPayment` — marks an installment as paid, unlocks credits, optionally overrides next interval
- `installments.manualUnlock` — unlocks a locked package instance, requires reason; admin-only
- `installments.processRefund` — processes a refund for a package instance (amount in cents); admin-only
- `installments.suggestRefund` — calculates suggested refund amount based on credits used vs unlocked; fetched when refund dialog opens
- `installmentPlans.list` — active plans for the plan dropdown + Plan Type badge label resolution (orphan codes from deactivated plans fall back to raw-code string transform)

Note: All `installments.*` calls use `(client as any)` cast — the router is not yet reflected in the generated oRPC client type.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx`
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — copyable client ID display
- `Sheet`, `Dialog` — shadcn/ui — detail slide-over and confirmation dialogs
- `Badge`, `Button`, `Input`, `Label`, `Textarea`, `Select`, `Separator` — shadcn/ui primitives

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQueryClient` — for query invalidation
- `useDebounce` (`@/hooks/useDebounce`) — 300ms debounce on the search input
- `useMemo` — builds `plansMap` from the plans query for O(1) badge-label resolution

**Navigation: who navigates here:**
- App sidebar under Scheduling section → "Installments" link

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `package_instances` | SELECT / UPDATE | `id`, `clientId`, `paymentPlanType`, `creditsTotal`, `creditsUnlocked`, `creditsUsed`, `creditsRemaining`, `installmentsPaid`, `installmentsTotal`, `nextDueDate`, `isLocked`, `lockedReason`, `gracePeriodEndsAt` |
| `installments` | SELECT / UPDATE | `id`, `installmentNumber`, `amount`, `dueDate`, `paidAt`, `status` |

**Status logic:**
```typescript
function getInstanceStatus(instance): "Active" | "Overdue" | "Locked" {
  if (instance.isLocked) return "Locked";
  if (instance.gracePeriodEndsAt) return "Overdue";
  return "Active";
}
```

**Confirm Payment form fields:** `paymentMethod` ("manual_transfer" | "cash"), `notes` (optional), `nextIntervalDays` (optional override)
**Manual Unlock form fields:** `reason` (required)
**Refund form fields:** `amount` in RM (converted to cents on submit), `reason` (required)

---

## 5. Tests

**Test files:** None found.
**Not tested:** Filtering tabs, sheet open/close, all three dialogs, mutation flows, status badge variants.

---

## 6. Notes

- The list is paginated at 50 items (`limit: 50, offset: 0`) but has no pagination UI — the first page is always shown.
- `totalPaidCents` for the refund dialog is computed client-side by summing all paid installment amounts from the secondary query.
- The refund dialog calls `installments.suggestRefund` (enabled when dialog opens + instanceId exists + admin) and auto-populates the refund amount input with the calculated suggested refund value on first open.
- The refund amount field also pre-fills as a fallback with `totalPaidCents / 100` (client-side sum of paid installments).
- All `installments.*` API calls use `(client as any)` — the `installments` router is not yet reflected in the generated oRPC client type. `installmentPlans.list` is called directly on the typed client.
- Filter composition: `search`, `dueBefore`, `dueAfter`, `paymentPlanCode`, and the existing `status` tab all AND together in the backend where-clause (`getAdminInstallmentOverview` in `packages/services/src/installment.service.ts`). "Clear" button resets search/dates/plan but not the status tab.
- Plan Type badge label is resolved via `plansMap.get(code)?.name` — falls back to raw-code transform (`full` → "Full") for orphan codes (plan was deactivated but historical instances still reference it).
