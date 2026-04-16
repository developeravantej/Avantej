# Installment Packages

**Route:** `/dashboard/packages/installments/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Permission guard:** `service_management:read` (via `requirePermission` in `beforeLoad`)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Admin view to oversee all installment-based package instances across the organization — tracking payment progress, overdue status, locked accounts, and allowing manual payment confirmation, unlock, and refund.
**Produces:** Filterable table of package instances on installment plans (All / Active / Overdue / Locked tabs). Clicking "View" opens a slide-over with a full installment timeline and action buttons.
**On success:** Mutations (confirm payment, unlock, refund) refresh the list and detail data; success toasts shown.
**On failure / error states:** Full-page spinner while loading list; error toasts on mutation failure; "Select an organization" guard.

---

## 2. How It Works

**Execution flow:**
```
InstallmentsViewPage
  → useUserContext() → organizationId
  → useState(statusFilter: "active" | "overdue" | "locked" | undefined)
  → useQuery(installments.adminOverview) → client.installments.adminOverview({ organizationId, status, limit: 50, offset: 0 })
  → renders DataTable with Client ID, Plan Type, Credits, Progress, Next Due Date, Status, View button
  → "View" → openSheet(instance) → selectedInstance state
  → useQuery(installments.listByPackageInstance) → client.installments.listByPackageInstance({ organizationId, packageInstanceId })
  → Sheet shows installment timeline table + action buttons
  → "Confirm Payment" → Dialog → useMutation(installments.confirmPayment)
  → "Manual Unlock" → Dialog → useMutation(installments.manualUnlock)
  → "Process Refund" → Dialog → useMutation(installments.processRefund)
```

**Inputs:** No URL params. Status filter is local state.
**State management:** `useState` for statusFilter, selectedInstance, sheetOpen, three dialog open flags, and form fields (paymentMethod, notes, nextIntervalDays, unlockReason, refundAmount, refundReason). TanStack Query for list and per-instance installments.
**Outputs:** Three mutations with cache invalidation.
**Side effects:** Cache keys `["installments-overview", orgId]` and `["installments-by-instance", orgId, instanceId]` invalidated after each mutation.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `installments.adminOverview` — paginated list of package instances with installment plan info (limit 50)
- `installments.listByPackageInstance` — individual installment records for a selected instance
- `installments.confirmPayment` — marks an installment as paid, optionally overrides next interval
- `installments.manualUnlock` — unlocks a locked package instance, requires reason
- `installments.processRefund` — processes a refund for a package instance (amount in cents)

Note: All `installments.*` calls use `(client as any)` cast — the router may not yet be fully typed.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx`
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — copyable client ID display
- `Sheet`, `Dialog` — shadcn/ui — detail slide-over and confirmation dialogs
- `Badge`, `Button`, `Input`, `Label`, `Textarea`, `Select`, `Separator` — shadcn/ui primitives

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQueryClient` — for query invalidation

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
- The refund amount field pre-fills with the total paid amount (converted from cents to RM string).
- All `installments.*` API calls use `(client as any)` — the `installments` router is not yet reflected in the generated oRPC client type.
