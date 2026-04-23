# My Packages & Credits

**Route:** `(app)/dashboard/packages`
**File:** `apps/native/app/(app)/dashboard/packages/index.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View purchased packages/credit bundles, track credit usage progress, see expiry countdowns, and manage packages. Filter by status (all, active, expired, exhausted).
**Produces:** Scrollable list of package cards with image, status badge, credit progress bar, expiry info, and action button. Tab filter for status. Empty state if no packages.
**On success:** Packages load with progress bars and expiry text; tap "View Package Details" button.
**On failure / error states:** Loading skeletons while fetching; empty state if no packages in selected filter.

---

## 2. How It Works

**Execution flow:**
1. Get `organizationId` from `useOrganization()` hook
2. Track selected status filter via state (default: "all")
3. Query package instances: `orpc.packageInstances.listForClient({ organizationId, status? })`
4. Map instances to display format: extract packageName, credits (total/remaining), status, price, category, image, expiry date
5. On status tab tap: update filter state, re-query packages
6. For each package, calculate: progress percent = (used / total) * 100, expiry countdown
7. Render cards with:
   - Image + name + status badge (color-coded)
   - Category, credits remaining, purchase date, price
   - Progress bar showing credit usage
   - Expiry countdown (e.g., "Expires in 15 days") if active
8. On package card button tap: navigate to `/dashboard/bookings/[id]` (appears to link to booking, but params suggest package ID)
9. On "Buy Package" button (empty state): navigate to `/dashboard/buy-package/setup`
10. Hide tab bar on focus, show on blur

**Inputs:** None (organization context)
**State management:**
- Local state: `statusFilter` (one of: "all", "active", "expired", "exhausted")
- Local state: `refreshing` for pull-to-refresh UI
- TanStack Query: `packageInstances` query (re-runs when statusFilter changes)
**Outputs:** Scrollable Container with package cards and filter tabs
**Side effects:** Tab bar hidden on focus; pull-to-refresh refetches query

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.packageInstances.listForClient` — fetches user's package instances (filtered by status)
**Uses these components:**
- `Container` (path: `@/components/container`) — root layout
**Uses these hooks:**
- `useOrganization()` — provides organizationId
- `useFocusEffect()`, `useNavigation()` — tab bar control
- `useQuery()` from TanStack Query
- `useCallback()`, `useState()` from React
**Navigation: who navigates here:** From `/dashboard/bookings` quick-link or tab navigator
**Navigation: where it goes:**
  - `/dashboard/bookings/[id]` (View Package Details button—likely a bug, should go to package detail)
  - `/dashboard/buy-package/setup` (Buy Package, empty state)

---

## 4. Data Shapes

**DB tables touched:** `packageInstances`, `packages` (tenantDb, read-only)
**Key types / Zod schemas:**
Input to `listForClient`:
```
{
  organizationId: string
  status?: "active" | "expired" | "exhausted" (optional; "all" = no filter)
}
```
Package instance object (raw):
```
{
  id: string
  status: "active" | "expired" | "exhausted" | "cancelled" | "pending"
  creditsTotal: number
  creditsRemaining: number
  createdAt: ISO string
  expiresAt?: ISO string
  startsAt?: ISO string
  totalPrice: number
  package: {
    name: string
    appointmentType: string
    imageUrl?: string
  }
}
```
Package object (mapped for display):
```
{
  id: string
  packageName: string
  totalCredits: number
  remainingCredits: number
  purchaseDate: string (formatted)
  status: string
  price: number
  category: string
  imageUrl: string
  expiresAt?: string
  startsAt?: string
}
```

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):**
- Navigation on "View Package Details" (params use pkg.id, but route goes to `/bookings/[id]`—likely wrong)
- Tab bar recursion (same fragile pattern)
- Expiry countdown calculation with timezones
- Status badge color lookup (uses STATUS_BADGE record, but handles unknown statuses gracefully)
- Progress bar calculation with zero total credits (divides by 0 check present: `pkg.totalCredits > 0`)

---

## 6. Notes

- Status filter UI uses pill tabs; selected tab has primary color background, unselected has outline style.
- Progress bar shows credits used (total - remaining); bar width = (used / total) * 100%.
- Expiry text only shown if status is "active"; logic checks for specific days ("30 days" vs others).
- Expiry countdown calculated from now, not package created time—respects actual expiry date.
- Package image URL has fallback (DEFAULT_IMAGE) if missing.
- "Buy Package Details" button is oddly styled (white background with border) but text says "View Package Details".
- Price displayed to 2 decimal places using `.toFixed(2)`.
- Empty state message: "No Packages Yet" with "Buy Package" button.
- Pull-to-refresh UI managed manually with RefreshControl; doesn't integrate with React Query's built-in refetch state.
