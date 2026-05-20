# Installment Packages (Tab)

**Route:** `/dashboard/packages/view?tab=installments`
**File:** `apps/web/src/components/pages/packages/installments-page.tsx` (rendered as a tab inside the Packages route)
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Admin view to oversee all installment-based package instances across the organization — tracking payment progress, due-soon items, overdue status, locked accounts, with mutations for confirming payments, manual unlock, overdraft, credit adjustment, and (now) requesting refunds via the new refunds workflow.
**Produces:** Status tabs (All / Active / Due Soon / Overdue / Locked) + collapsible filter row (debounced search by clientId prefix / exact purchaseNumber, due-before/due-after date pickers, plan-code dropdown). Row click opens a `PackageDetailDialog` with the installment timeline + action buttons (Manual Unlock, Allow/Disable Overdraft, Adjust Credits, Request Refund).
**On success:** Mutations refresh the list and detail data; success toasts shown.
**On failure / error states:** Skeleton rows while loading; error toasts on mutation failure; "Select an organization" guard.

---

## 2. How It Works

**Execution flow:**
```
PackageInstallmentsPage (components/pages/packages/installments-page.tsx)
  → useUserContext() → organizationId
  → local state (statusFilter, search/dueBefore/dueAfter/planCode, sheet open, dialog flags, form fields)
  → useDebounce(searchQuery, 300) → debouncedSearch
  → useQuery(installmentPlans.list)            // plansMap drives Plan Type badge + dropdown
  → useQuery(installments.adminOverview)       // paginated 50, accepts all filters
  → <InstallmentsTable …onRowClick={openSheet} />
       (features/installments/components/installments-table.tsx — pure presentational)
  → useQuery(installments.listByPackageInstance) when a row is selected
  → <PackageDetailDialog …/>                   // summary + installment timeline + actions
  → action buttons open dialogs:
       <ConfirmPaymentDialog/>     uses confirmPaymentMutation
       <ManualUnlockDialog/>       uses manualUnlockMutation
       <AdjustCreditsDialog/>      uses adjustCreditsMutation
       <OverdraftDialog/>          uses setOverdraftMutation
       <RequestRefundDialog/>      calls refunds.request (NEW: replaces installments.processRefund)

useInstallmentMutations() (features/installments/hooks/useInstallmentMutations.ts)
  → returns { confirmPayment, manualUnlock, adjustCredits, setOverdraft } mutations
  → each invalidates ["installments-overview", orgId] and ["installments-by-instance", orgId, instanceId]
```

**Inputs:** No URL params. All filter state is local. `selectedInstance` drives the per-instance query.
**State management:** `useState` for filters / dialog flags / form fields, `useDebounce` for search, `useMemo` for plansMap, TanStack Query for list / plans / installments / suggestRefund. Mutations live in the extracted `useInstallmentMutations` hook (each owns its own success/error toast + dialog-close behaviour).
**Outputs:** Four installment mutations + one refund request (via `RequestRefundDialog`).
**Side effects:** Cache invalidation of `installments-overview` and `installments-by-instance` after each mutation. Refund flow now creates a Pending refund row rather than processing immediately.

---

## 3. What Depends On It

**Calls these API endpoints (via `@/utils/orpc` typed client):**
- `installments.adminOverview` — paginated list, accepts `status` (`active|overdue|locked|due_soon`), `search`, `dueBefore`, `dueAfter`, `paymentPlanCode`; returns `{ items, total }` with optional per-row `nextInstallmentAmount`, `allowCreditOverdraft`, `clientName`
- `installments.listByPackageInstance` — per-instance installments; also re-evaluates lock state server-side
- `installments.confirmPayment` — marks installment paid, unlocks credits, optional `nextIntervalDays` override
- `installments.manualUnlock` — unlocks a locked instance (required reason)
- `installments.adjustCredits` — admin override of `creditsUnlocked` / `creditsUsed` with required reason; mutation also patches local `selectedInstance` on success
- `installments.setOverdraft` — toggles `allowCreditOverdraft` flag with required reason
- `installments.suggestRefund` — calculates a refund hint (enabled when refund dialog opens)
- `installmentPlans.list` — populates Plan dropdown + Plan Type badge labels
- `refunds.request` — NEW path: opening "Request Refund" now invokes `RequestRefundDialog`, which calls `refunds.request` to create a pending refund row for ops review (replaces deprecated `installments.processRefund`)

All calls use the typed `client` — earlier `(client as any)` casts have been removed.

**Uses these components:**
- `features/installments/components/installments-table.tsx` — header + filter row + status tabs + table (skeletons, empty state, Plan Type badge, Next Amount column when `statusFilter === "due_soon"`, Overdraft pill)
- `features/installments/components/package-detail-dialog.tsx` — summary card + step progress bar + per-installment table + action buttons (Manual Unlock visible only when locked)
- `features/installments/components/confirm-payment-dialog.tsx` — paymentMethod, notes, nextIntervalDays
- `features/installments/components/manual-unlock-dialog.tsx` — required reason
- `features/installments/components/adjust-credits-dialog.tsx` — inline preview of `available = unlocked − used`, validation that `unlocked ≤ total` and `used ≤ unlocked`, shows "Admin override active" pill when `creditsAdminOverride`
- `features/installments/components/overdraft-dialog.tsx` — toggles overdraft on/off with reason
- `features/installments/components/status-badges.tsx` — `StatusBadge` (instance: Active/Overdue/Locked) + `InstallmentStatusBadge` (paid/overdue/pending)
- `components/refunds/request-refund-dialog.tsx` — new refunds workflow entry point, takes `suggestedAmountCents` from `installments.suggestRefund`
- `CopyableCell` — clipboard-copy client ID with optional display text
- shadcn primitives: `Table`, `Dialog`, `Badge`, `Button`, `Input`, `Label`, `Select`, `Textarea`, `Skeleton`, `Separator`

**Uses these hooks:**
- `useUserContext`, `useQueryClient`, `useDebounce` — from app code
- `useInstallmentMutations` — extracted hook owning the four mutations

**Uses these types (`features/installments/types.ts`):** All inferred via `Awaited<ReturnType<typeof client.installments.*>>`:
- `InstallmentOverviewItem` = `client.installments.adminOverview` items
- `Installment` = `client.installments.listByPackageInstance` items
- `InstallmentPlan` = `client.installmentPlans.list` items
- `SuggestRefundResult` = `client.installments.suggestRefund` result

**Navigation:**
- Reached via Packages page tab navigation (or legacy redirect `/dashboard/packages/installments/view` → `?tab=installments`).
- No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns |
|-------|-----------|-------------|
| `package_instances` | SELECT / UPDATE | `id`, `clientId`, `paymentPlanType`, credits fields, `installmentsPaid/Total`, `nextDueDate`, `isLocked`, `lockedReason`, `gracePeriodEndsAt`, `allowCreditOverdraft`, `creditsAdminOverride` |
| `installments` | SELECT / UPDATE | `id`, `installmentNumber`, `amount`, `dueDate`, `paidAt`, `status` |
| `refunds` | INSERT (via `refunds.request`) | refund request rows pending approval |

**Status logic (`features/installments/utils.ts`):**
```typescript
function getInstanceStatus(instance): "Active" | "Overdue" | "Locked" {
  if (instance.isLocked) return "Locked";
  if (instance.gracePeriodEndsAt) return "Overdue";
  return "Active";
}
```

**Form fields:**
- **Confirm Payment:** `paymentMethod` ("manual_transfer" | "cash"), `notes` (opt), `nextIntervalDays` (opt override)
- **Manual Unlock:** `reason` (required)
- **Adjust Credits:** `creditsUnlocked` (opt), `creditsUsed` (opt), `reason` (required) — validates `unlocked ≤ total`, `used ≤ unlocked`
- **Overdraft:** `reason` (required) — flips boolean
- **Refund:** handled inside `RequestRefundDialog` (suggested amount pre-filled from `installments.suggestRefund`)

---

## 5. Tests

**Test file:** `apps/web/src/__tests__/pages/packages/installments-page.test.tsx`
**Not covered:** Filtering tabs, sheet open/close, all dialogs, mutation flows, status badge variants, request-refund integration. After the refactor each dialog is now isolated enough to be unit-tested independently.

---

## 6. Notes

- **Major refactor (May 2026):** monolithic component split into `features/installments/` — sub-components, hooks, types, and utils now live alongside the page wrapper. `installments-page.tsx` is the thin orchestrator; presentational concerns are in `features/installments/components/`.
- **Refund flow change:** `installments.processRefund` is deprecated. The page now opens `RequestRefundDialog` which calls `refunds.request` to create a Pending refund row for review — no in-place processing anymore. `installments.suggestRefund` still fetches the hint.
- **Due Soon tab adds a "Next Amount" column** (formatted via `formatPrice(cents, "MYR")`); other tabs hide it.
- **Overdraft pill** appears on the row when `allowCreditOverdraft` is true.
- **`adjustCredits` mutation patches local state** with the returned `updated` instance so the dialog reflects new values without a full refetch.
- The list is paginated at 50 (limit/offset hard-coded) but has no pagination UI — the first page is always shown.
- `formatPrice` now imported from `@/lib/money` (not the older `lib/currency` path).
- Plan Type badge falls back to a raw-code title-case (`partial_3` → "Partial 3") when the plan is orphan/deactivated.
