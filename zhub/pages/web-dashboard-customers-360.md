# Customer 360

**Route:** `/dashboard/customers/$id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx:1`
**Platform:** web
**Auth required:** authenticated + `customer_management:read`
**Last updated:** 2026-04-21

---

## 1. What It Does

**Purpose (user perspective):** Full-page profile for a single registered customer. Consolidates header info, KPI strip, and 4 tabs of history — Overview, Packages, Payments, Appointments.

**Produces:**
- **Header:** Avatar circle (initials), name, status badge, email, phone (optional), joined date
- **KPI strip:** LTV (always "N/A"), Outstanding balance (MYR), Active Packages count, Appointment count
- **Tabs:**
  - **Overview** — Recent Payments (up to 5) + Upcoming Appointments (confirmed, limit 3)
  - **Packages** — expandable `PackageRow` per package instance (lazy-loads installments + preferred times)
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
```

**Route param:** `id` = tenant DB `members.id` (UUID). Customer's control-panel userId (`detail.member.userId`) used for appointment filtering.

**State management:** TanStack Query only (no local state).

**Inputs:** URL param `$id` only.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `customerDirectory.getById` — returns `{ member, user: {name, email}, profile, packageInstances, recentPayments, appointmentCount, outstandingBalanceCents }`
- `appointments.list` × 2 — `clientUserId` param (added in Tier 4); upcoming (limit 3) + all (limit 50)

**Uses these components:**
- `PackageRow` — `apps/web/src/components/customers/customer-360/package-row.tsx` — expandable row; lazy-loads `installments.listByPackageInstance` + `preferredTimes.list`
- `Alert`, `Badge`, `Button`, `Card`, `Skeleton`, `Tabs` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — `organizationId`, `hasPermission`
- `useQuery` × 3 — TanStack Query

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

---

## 5. Tests

**Test files:** None.

**Not tested:**
- NOT_FOUND retry guard (retry: false on 403/404)
- Appointment tabs when `clientUserId` is null
- PackageRow expand → installments lazy load

---

## 6. Notes

- **Reached via Customer Directory "Profile" button only** — not in sidebar; no direct nav entry.
- The `appointments.list` `clientUserId` param was added in Tier 4 as a backend change to `packages/api/src/routers/appointments.ts`. Before Tier 4, this page could not filter appointments by client.
- `serviceName` on appointments is enriched by the router's batch join but the TypeScript type is the base `AppointmentRow` — the cast `appt as { serviceName?: string | null }` is intentional.
- LTV is "N/A" by design — the `getById` service does not compute lifetime value. A future enhancement could add it to the analytics or customerDirectory service.
