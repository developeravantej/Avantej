# Customer 360

**Route:** `/dashboard/customers/$id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx:1`
**Platform:** web
**Auth required:** authenticated + `customer_management:read`
**Last updated:** 2026-05-09

---

## New in this update

- **Preferred Times inline edit** added to `PackageRow`. When a package row is expanded, a "Preferred Times" sub-section appears with an Edit button. Clicking Edit switches to `PreferredTimesEditor` mode.
- `PreferredTimesEditor` — new component at `apps/web/src/components/customers/customer-360/preferred-times-editor.tsx`. Supports up to 4 time slots; each slot has a day-of-week Select and a time input. Slots are re-numbered on removal. Save calls `preferredTimes.upsert`.
- Preferred-times query **lifted into `PackageRow`** (from a sub-component) so the edit draft can be pre-populated from live data. Query is enabled only when the row is expanded.
- `upsertPreferredMutation` added to `PackageRow` — invalidates `["preferredTimes", organizationId, pkg.id]` on success.

---

## 1. What It Does

**Purpose (user perspective):** Full-page profile for a single registered customer. Consolidates header info, KPI strip, and 4 tabs of history — Overview, Packages, Payments, Appointments.

**Produces:**
- **Header:** Avatar circle (initials), name, status badge, email, phone (optional), joined date
- **KPI strip:** LTV (always "N/A"), Outstanding balance (MYR), Active Packages count, Appointment count
- **Tabs:**
  - **Overview** — Recent Payments (up to 5) + Upcoming Appointments (confirmed, limit 3)
  - **Packages** — expandable `PackageRow` per package instance; lazy-loads installments + preferred times
  - **Payments** — full payment history table (date, amount, method, status)
  - **Appointments** — all appointment history table (service, date, time, status)

**On success:** All sections populate from `customerDirectory.getById`.
**On failure:** Alert with "Customer not found" or "Failed to load" + back button to `/dashboard/customers/view`.
**On loading:** `PageSkeleton` (avatar + 4 KPI card skeletons + content skeleton).

---

## 2. How It Works

**Execution flow:**
```
Customer360Page
  → Route.useParams() → id (tenant DB memberId)
  → useUserContext() → organizationId, hasPermission("customer_management:read")

  Primary query:
  → useQuery(["customerDirectory", "detail", organizationId, id])
    → client.customerDirectory.getById({ organizationId, memberId: id })
    staleTime: 60_000; retry: false on 404/403

  Overview tab queries (enabled when detail loaded):
  → useQuery(["appointments", "upcoming", organizationId, detail.member.userId])
    → client.appointments.list({ clientUserId: detail.member.userId, status: "confirmed", limit: 3 })
  → useQuery(["appointments", "all", organizationId, detail.member.userId])
    → client.appointments.list({ clientUserId: detail.member.userId, limit: 50 })

PackageRow (rendered in Packages tab, one per packageInstance):
  → useState(expanded, editingPreferred, draftTimes)
  → useQuery(["preferredTimes", organizationId, pkg.id])
      → client.preferredTimes.list({ organizationId, packageInstanceId: pkg.id })
      enabled: expanded
  → useQuery(["installments", organizationId, pkg.id])
      → client.installments.listByPackageInstance({ organizationId, packageInstanceId: pkg.id })
      (inside InstallmentsSection sub-component — unchanged)

  Preferred times edit flow:
  → Edit button → setDraftTimes(preferredData mapped to PreferredTimeItem[]) → setEditingPreferred(true)
  → PreferredTimesEditor(items=draftTimes, onChange=setDraftTimes, ...)
      → up to 4 slots, each: dayOfWeek Select + time Input + remove button
      → "+ Add slot" disabled when items.length >= 4
  → Save → upsertPreferredMutation.mutate(draftTimes)
      → client.preferredTimes.upsert({ organizationId, packageInstanceId: pkg.id, items })
      → onSuccess: toast + invalidate ["preferredTimes", organizationId, pkg.id] + setEditingPreferred(false)
  → Cancel → setEditingPreferred(false)
```

**Route param:** `id` = tenant DB `members.id` (UUID). Customer's control-panel userId (`detail.member.userId`) used for appointment filtering.

**State management:** TanStack Query for page-level data. `PackageRow` holds local `expanded`, `editingPreferred`, `draftTimes` state.

**Inputs:** URL param `$id` only.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `customerDirectory.getById` — returns `{ member, user: {name, email}, profile, packageInstances, recentPayments, appointmentCount, outstandingBalanceCents }`
- `appointments.list` × 2 — `clientUserId` param; upcoming (limit 3) + all (limit 50)
- `installments.listByPackageInstance` — per package row, lazy; required for installments sub-section
- `preferredTimes.list` — per package row, lazy (enabled when expanded); required for preferred times display and edit draft
- `preferredTimes.upsert` — submit preferred times edit (up to 4 slots)

**Uses these components:**
- `PackageRow` — `apps/web/src/components/customers/customer-360/package-row.tsx` — expandable row; handles installments + preferred times query + upsert mutation
- `PreferredTimesEditor` — `apps/web/src/components/customers/customer-360/preferred-times-editor.tsx` — inline editor for up to 4 preferred time slots
- `Alert`, `Badge`, `Button`, `Card`, `Skeleton`, `Tabs` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — `organizationId`, `hasPermission`
- `useQuery` × 3 (page level) — TanStack Query
- `useQuery` × 2 + `useMutation` × 1 (per `PackageRow`) — preferred times + installments + upsert

**Navigation: incoming:**
- "Profile" button in Customer Directory table (`/dashboard/customers/view`) → `navigate({ to: "/dashboard/customers/$id", params: { id: row.original.memberId } })`

**Navigation: outgoing:**
- "← Customers" back button → `/dashboard/customers/view`

---

## 4. Data Shapes

**Primary response (`customerDirectory.getById`):**
```typescript
{
  member: { id, userId, status, joinedAt, ... }
  user: { name, email }
  profile: { phone?, ... } | null
  packageInstances: PackageInstanceRow[]   // all instances for this member
  recentPayments: PaymentRow[]             // recent payment records
  appointmentCount: number                 // total historical count
  outstandingBalanceCents: number          // sum of unpaid amounts
}
```

**`preferredTimes.list` response (per PackageRow):**
```typescript
Array<{ id: string; dayOfWeek: string; time: string; priority: number }>
```

**`PreferredTimesEditor` item type:**
```typescript
type PreferredTimeItem = {
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  time: string;    // HH:MM
  priority: number; // 1-indexed; auto-renumbered on slot removal
};
```

**Field notes:**
- `member.userId` = control-panel user ID (text) — used as `clientUserId` for appointment filtering
- `installments.amount` (NOT `amountCents`) — confirmed from tenant schema
- `member.joinedAt` (NOT `createdAt`) — the actual field on `MemberRow`
- `profile.phone` (NOT `phoneNumber`) — matches `CustomerProfileRow`
- LTV displayed as "N/A" — not computed by `getById`
- `serviceName` cast via `appt as { serviceName?: string | null }` — enriched by appointments router but not in base type

**DB tables touched (via getById service):**
| Table | Operation | Notes |
|-------|-----------|-------|
| `members` (tenant) | READ | primary record |
| `customer_profiles` (tenant) | READ | optional profile fields |
| `package_instances` (tenant) | READ | all for this member |
| `payments` + `sales_orders` (tenant) | READ | recentPayments + outstandingBalance |
| `user` (control panel) | READ | cross-DB name + email |
| `preferred_times` (tenant) | READ / UPSERT | per-package, lazy-loaded in PackageRow |
| `installments` (tenant) | READ | per-package, lazy-loaded in PackageRow |

---

## 5. Tests

**Test files:** None.

**Not tested:**
- NOT_FOUND retry guard (retry: false on 403/404)
- Appointment tabs when `clientUserId` is null
- PackageRow expand → installments lazy load
- Preferred times edit → upsert → cache invalidation
- PreferredTimesEditor slot add/remove/reorder

---

## 6. Notes

- **Reached via Customer Directory "Profile" button only** — not in sidebar; no direct nav entry.
- The preferred-times query is `enabled: expanded` — no network call is made until the PackageRow is expanded. This means the Edit button will not be clickable until data has loaded (or shows "No preferred times set" if the query returns empty).
- `draftTimes` is populated from live `preferredData` at the moment the Edit button is clicked — not reactive to subsequent refetches while editing is in progress.
- Slot `priority` is 1-indexed and auto-renumbered on removal (filter then map to `i+1`). The `PreferredTimesEditor` uses array index as key (biome-ignored) because ordering is the identity.
- Max 4 slots enforced client-side in `PreferredTimesEditor.addItem()`; "+ Add slot" is disabled when `items.length >= 4`.
- `serviceName` on appointments is enriched by the router's batch join but the TypeScript type is the base `AppointmentRow` — the cast `appt as { serviceName?: string | null }` is intentional.
- LTV is "N/A" by design — the `getById` service does not compute lifetime value.
- The `appointments.list` `clientUserId` param was added in Tier 4 as a backend change to `packages/api/src/routers/appointments.ts`. Before Tier 4, this page could not filter appointments by client.
