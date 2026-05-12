# Package Instances

**Route:** `/dashboard/packages/instances/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx:1`
**Component file:** `apps/web/src/components/pages/packages/instances-page.tsx`
**Platform:** web
**Auth required:** authenticated
**Permission guard:** `service_management:read` (via `requirePermission` in `beforeLoad`)
**Last updated:** 2026-05-09

---

## New in this update

- **Staff column** added to the instances table — each row has a "Staff" button that opens the Assigned Staff dialog.
- **Assigned Staff dialog** — view, add, and remove trainer/staff per package instance; slot 0 = primary trainer. Uses new `packageInstanceStaff` router.
- **Status History dialog** — clicking any table row opens a cursor-paginated status timeline via `packageInstances.statusHistory`. Uses `StatusTimeline` component.
- `historyInstanceId` and `staffInstanceId` state variables manage which dialogs are open.
- `clientName` is now resolved from control panel and displayed in the Client column alongside the copyable ID.
- `pending` added as a valid `InstanceStatus` (stat card filter tab added).
- Table column count increased from 9 to 10 (added Staff column).

---

## 1. What It Does

**Purpose (user perspective):** Admin view to see all package assignments and purchases across clients, with the ability to manually assign a package to a client, view status history, and manage trainer/staff assignments per instance.

**Produces:**
- Stat cards: Total, Active, Credits Used, Revenue.
- Filter tab bar: All / Active / Pending / Expired / Exhausted / Cancelled.
- Table (10 columns): Service, Client, Source, Credits Used, Remaining, Total (MYR), Starts, Expires, Status, Staff.
- "Assign Pack" button → create dialog.
- Clicking a row → Status History dialog.
- Clicking "Staff" button in a row → Assigned Staff dialog.

**On success:** Assignment creates a new instance; table refreshes; success toast.
**On failure / error states:** Full-page empty state while loading (skeleton rows); validation toasts on form errors; "Select an organization" guard.

---

## 2. How It Works

**Execution flow:**
```
PackageInstancesPage
  → useUserContext() → organizationId
  → useState(statusFilter, createOpen, form, historyInstanceId, staffInstanceId, assignStaffId)

  Main list:
  → useQuery(["packageInstances", organizationId, statusFilter])
      → client.packageInstances.listAll({ organizationId, status })
        → returns rows with clientName (cross-DB join)
  → rows mapped to PackageInstanceRow[] (clientName included)

  Create form (on demand, when createOpen=true):
  → useQuery(["services-packages", organizationId, true]) → packages with sessionCount > 0
  → useQuery(["installmentPlans-active", organizationId]) → active plans

  Name resolution (always-on, no isActive filter):
  → useQuery(["services-all", organizationId]) → all services for serviceNameById map

  Row click → setHistoryInstanceId(row.id)
  → Dialog opens → PackageInstanceHistory sub-component
      → useQuery(["packageInstances", "statusHistory", packageInstanceId])
          → client.packageInstances.statusHistory({ organizationId, packageInstanceId })
          → renders <StatusTimeline entries={data?.rows} />

  Staff button click → setStaffInstanceId(row.id)
  → useQuery(["packageInstanceStaff", staffInstanceId, organizationId])
      → client.packageInstanceStaff.list({ organizationId, packageInstanceId })
  → useQuery(["members", organizationId, "trainer"])
      → client.members.list({ organizationId, role: "trainer", status: "active" })
  → assign: assignStaffMutation → client.packageInstanceStaff.assign(...)
      slotIndex = max(staffRows[].slotIndex) + 1 (or 0 if empty)
  → remove: removeStaffMutation → client.packageInstanceStaff.remove(...)

  Create form submit:
  → createMutation → client.packageInstances.create(input)
      server scales totalPrice by plan.pricePremiumBps when installment plan selected
      if plan.numInstallments > 1, server calls createInstallmentSchedule
```

**State management:** `useState` for filter, dialog flags, form fields. Five separate `useQuery` calls. Multiple `useMutation` calls.

**Outputs:** Table render; create/assign mutations invalidate their respective cache keys.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `packageInstances.listAll` — all instances for org, optionally filtered by `status`; returns `clientName` from control-panel join
- `packageInstances.create` — manually assign a package to a client; server applies plan premium; creates installment schedule when applicable
- `packageInstances.statusHistory` — cursor-paginated status transition log for a specific instance; requires `package_management:read`
- `packageInstances.listForClient` — client view (native app)
- `packageInstances.getActiveForClient` — most recent active instance (native app dashboard)
- `packageInstances.getById` — accessible by owning client or staff with `service_management:read`
- `packageInstanceStaff.list` — list staff assignments for an instance; requires `package_management:read`
- `packageInstanceStaff.assign` — assign staff to a slot (UPSERT); requires `package_management:update`
- `packageInstanceStaff.remove` — remove staff from an instance by staffId; requires `package_management:update`
- `services.list` (twice) — packages selector (on demand) + name map (always-on)
- `installmentPlans.list` (activeOnly: true) — plan selector in create form (on demand)
- `members.list` — trainer list for Staff dialog (on demand when staffInstanceId set)

**Uses these components:**
- `StatusTimeline` — `apps/web/src/components/ui/status-timeline.tsx` — renders cursor-paginated status entries
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — serviceId and clientId with copy-to-clipboard; displays clientName when available
- `Dialog` — shadcn/ui modal (used for create, history, and staff dialogs)
- `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableCell` — shadcn/ui table (not DataTable)
- `Badge`, `Button`, `Input`, `Label`, `Textarea`, `Select`, `Separator`, `Skeleton` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useMemo` — builds `serviceNameById: Map<string, string>` from all-services query
- `useApiMutation` — create, assign, remove mutations (wraps success toast + invalidation)

**Navigation: who navigates here:**
- App sidebar under Scheduling section → "Package Instances" / "Session Packs" link

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `package_instances` | SELECT / INSERT / UPDATE | `id`, `serviceId`, `clientId`, `source`, `status`, `creditsTotal`, `creditsRemaining`, `creditsUsed`, `totalPrice`, `startsAt`, `expiresAt`, `paymentStatus`, `paymentPlanType`, `assignedTrainerId`, `remark`, ... |
| `services` | SELECT | `id`, `name`, `sessionCount`, `isActive` |
| `package_instance_staff` | SELECT / INSERT / DELETE | `id`, `packageInstanceId`, `staffId`, `slotIndex`, `role`, `assignedBy` |
| `package_instance_status_history` | SELECT | cursor-paginated status transitions |
| `user` (control panel) | SELECT | `id`, `name` — clientName resolution in listAll |

**Key types:**
```typescript
type InstanceStatus = "active" | "expired" | "exhausted" | "cancelled" | "pending";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

interface PackageInstanceRow {
  id: string;
  serviceId: string;
  serviceName: string;         // resolved from serviceNameById map
  clientId: string;
  clientName: string | null;   // resolved from control-panel join in listAll
  source: string;              // "assigned" | "purchased"
  creditsTotal: number;
  creditsRemaining: number;
  creditsUsed: number;
  totalPrice: number | null;   // cents
  startsAt: string | null;
  expiresAt: string | null;
  status: InstanceStatus;
  paymentStatus: PaymentStatus;
  createdAt: string | null;
}

// Staff assignment row (from packageInstanceStaff.list)
interface StaffRow {
  id: string;
  packageInstanceId: string;
  staffId: string;             // userId (control-panel)
  slotIndex: number;           // 0 = primary trainer
  role: string;                // e.g. "trainer"
  assignedBy: string | null;
}
```

**Create form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| serviceId | Select | required | `serviceId` (active packages with sessionCount > 0) |
| clientId | text input | required | `clientId` |
| source | Select | required | "assigned" \| "purchased" |
| paymentPlanType | Select | optional, `__none__` sentinel | plan `code`; omitted when `__none__` |
| creditsTotal | number | required, min 1 | `creditsTotal`; `creditsRemaining` set to same |
| startsAt | date | required, defaults today | `startsAt` (T00:00:00.000Z) |
| expiresAt | date | required, after startsAt | `expiresAt` (T23:59:59.000Z) |
| totalPriceRm | number | optional, decimal | converted to cents (`rmToCents`) → BASE price; server applies premium |
| paymentStatus | Select | optional | "pending" \| "paid" \| "failed" \| "refunded" |
| remark | textarea | optional | `remark` |

---

## 5. Tests

**Test files:** None found.
**Not tested:** Filtering tabs, form validation, create mutation, staff assignment dialog, status history dialog, service name resolution.

---

## 6. Notes

- Service names in the table are resolved client-side from the always-on `services-all` query. Archived service names fall back to `${serviceId.slice(0, 8)}…`.
- Client names are resolved server-side in `listAll` via a cross-DB join to the control-panel `user` table; the `clientName` field is on the API response.
- `totalPrice` is stored as integer cents; the form uses `rmToCents(parseFloat(totalPriceRm))`.
- **Installment premium** (added 2026-04-18): the form submits the BASE price; the server scales by `(10000 + plan.pricePremiumBps) / 10000`. The breakdown line in the form mirrors this math for transparency.
- **Staff dialog slotIndex**: next slot = `max(staffRows[].slotIndex) + 1` (or 0 if empty). Slot 0 is treated as the primary trainer by convention.
- **Status History dialog**: clicking anywhere on a row opens it; clicking the Staff button stops propagation to avoid opening both dialogs simultaneously.
- When `source: "purchased"` and the org setting `package_approval.required=true` (default), the created instance starts with `status: "pending"` regardless of the `status` input.
- `packageInstances.statusHistory` requires `package_management:read` (not `service_management`).
