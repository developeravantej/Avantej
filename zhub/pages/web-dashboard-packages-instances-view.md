# Package Instances

**Route:** `/dashboard/packages/instances/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Permission guard:** `service_management:read` (via `requirePermission` in `beforeLoad`)
**Last updated:** 2026-04-18

---

## 1. What It Does

**Purpose (user perspective):** Admin view to see all package assignments and purchases across clients, with the ability to manually assign a package to a client.
**Produces:** Filterable table (All / Active / Expired / Exhausted / Cancelled tabs) showing package name, client ID, source (assigned/purchased), credits used/remaining, total price, validity dates, and status. A "New Package" sheet allows manual assignment — includes an installment-plan selector with a live price-breakdown line when a plan with a premium is picked.
**On success:** Assignment creates a new instance; table refreshes; success toast.
**On failure / error states:** Full-page spinner while loading; validation toasts on form errors; "Select an organization" guard.

---

## 2. How It Works

**Execution flow:**
```
PackageInstancesViewPage
  → useUserContext() → organizationId
  → useState(statusFilter, createOpen, form)
  → useQuery(packageInstances.listAll) → client.packageInstances.listAll({ organizationId, status })
  → useQuery(services.list, isActive: true) — only when createOpen=true, filters sessionCount > 0
  → useQuery(services.list) — always-on, for service name lookup in table
  → useQuery(installmentPlans.list, activeOnly: true) — only when createOpen=true, populates plan select
  → useMemo → serviceNameById map (serviceId → name)
  → renders DataTable with status filter tabs
  → "Assign Package" button → setCreateOpen(true) → Sheet with form
  → form has paymentPlanType select; when a multi-installment plan is picked AND totalPriceRm > 0,
    a breakdown line renders under the price input:
      "Base RM X + N% premium = RM Y → K × RM Z every D days"
  → handleCreateSubmit → useMutation(packageInstances.create)
     • sends BASE totalPrice + paymentPlanType code; server scales by plan.pricePremiumBps
     • when plan has numInstallments > 1, router also calls createInstallmentSchedule
       to generate the installment payment schedule (uses the scaled total)
```

**Inputs:** No URL params. Status filter and form state are local.
**State management:** `useState` for statusFilter, createOpen, form fields. Three separate `useQuery` calls. One `useMutation`.
**Outputs:** Table render; create mutation invalidates `["packageInstances", orgId]`.
**Side effects:** Cache key `["packageInstances", orgId]` invalidated on successful assignment.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `packageInstances.listAll` — all instances for org, optionally filtered by `status`, `clientId`, or `source`
- `packageInstances.create` — manually assign a package to a client
- `packageInstances.listForClient` — client view; returns instances for session user; used by native app
- `packageInstances.getActiveForClient` — returns most recent active instance for session user; used by native app dashboard
- `packageInstances.getById` — get single instance; accessible by owning client or staff with `service_management:read`
- `services.list` (twice) — once for the create-form selector (active packages only, on demand), once always-on for name resolution in the table
- `installmentPlans.list` (activeOnly: true) — populates the plan select in the create form (on demand, when sheet is open)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx`
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — service ID and client ID with copy-to-clipboard
- `Sheet` — shadcn/ui slide-over for assign form
- `Badge`, `Button`, `Input`, `Label`, `Textarea`, `Select`, `Separator` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useMemo` — builds `serviceNameById: Map<string, string>` from all-services query

**Navigation: who navigates here:**
- App sidebar under Scheduling section → "Package Instances" link

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `package_instances` | SELECT / INSERT | `id`, `serviceId`, `clientId`, `source`, `assignedBy`, `purchaseNumber`, `paymentId`, `totalPrice`, `taxAmount`, `paymentStatus`, `paymentMethod`, `eSignature`, `termsAgreedAt`, `creditsTotal`, `creditsRemaining`, `creditsUsed`, `startsAt`, `expiresAt`, `status`, `remark`, `paymentPlanType`, `installmentsTotal`, `installmentsPaid`, `creditsUnlocked`, `nextDueDate`, `gracePeriodEndsAt`, `isLocked`, `lockedAt`, `lockedReason` |
| `services` | SELECT | `id`, `name`, `sessionCount`, `isActive` |

**Key types:**
```typescript
type InstanceStatus = "active" | "expired" | "exhausted" | "cancelled";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

interface PackageInstanceRow {
  id: string;
  serviceId: string;
  serviceName: string;        // resolved from serviceNameById map
  clientId: string;
  source: string;             // "assigned" | "purchased"
  creditsTotal: number;
  creditsRemaining: number;
  creditsUsed: number;
  totalPrice: number | null;  // cents
  startsAt: string | null;
  expiresAt: string | null;
  status: InstanceStatus;
  paymentStatus: PaymentStatus;
  createdAt: string | null;
}
```

**Create form fields (fields visible in the UI):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| serviceId | Select | required | `serviceId` (active packages with sessionCount > 0) |
| clientId | text input | required, UUID | `clientId` |
| source | Select | required | "assigned" \| "purchased" |
| creditsTotal | number | required, min 1 | `creditsTotal`; `creditsRemaining` auto-set to same value |
| startsAt | date | required, defaults to today | `startsAt` (set to T00:00:00.000Z) |
| expiresAt | date | required, after startsAt | `expiresAt` (set to T23:59:59.000Z) |
| totalPriceRm | number | optional, decimal | converted to cents (`* 100`) → `totalPrice` (BASE; server applies premium) |
| paymentPlanType | Select | optional; uses `"__none__"` sentinel for full-payment | plan `code` (e.g. `half`); omitted when `__none__` |
| paymentStatus | Select | optional | "pending" \| "paid" \| "failed" \| "refunded" |
| remark | textarea | optional | `remark` |

Note: `installmentIntervalDays`, `taxAmount`, `paymentMethod`, `eSignature`, `termsAgreedAt`, `purchaseNumber`, and `paymentId` are accepted by the API but are NOT exposed in this form UI. They are used by the native app purchase flow.

---

## 5. Tests

**Test files:** None found.
**Not tested:** Filtering tabs, form validation, create mutation, service name resolution, status badge variants.

---

## 6. Notes

- Service names in the table are resolved client-side from a separate always-on query (not embedded in `listAll` response). If a service was archived after instance creation, the name lookup uses its ID prefix as fallback: `${serviceId.slice(0, 8)}…`.
- The packages selector in the create form is only fetched (`enabled: !!organizationId && createOpen`) when the sheet is open — avoids an extra network call on page load.
- `totalPrice` is stored as integer cents; the form accepts decimal RM input and multiplies by 100 (rounded).
- When `paymentPlanType` is 'half' or 'quarterly', `creditsRemaining` on the created instance is forced to `0` regardless of input — credits are unlocked incrementally as installments are confirmed.
- **Installment premium** (added 2026-04-18): the form sends the BASE `totalPrice`; the server's `packageInstances.create` handler scales it by `(10000 + plan.pricePremiumBps) / 10000` when the selected plan has a non-zero premium. The breakdown line mirrors the server math for transparency, but the submitted value is always the unscaled base — the server is authoritative. The installment schedule splits the scaled total via `calculateInstallmentAmounts` (first installment absorbs any rounding remainder).
