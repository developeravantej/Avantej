# My Packages & Credits

**Route:** `/dashboard/packages`
**File:** `apps/native/app/(app)/dashboard/packages/index.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** View all purchased service packages, track credit usage and expiry, and buy new packages.

**Produces:** A scrollable list of package cards, each showing an image, package name, status badge, credit progress bar, expiry countdown, purchase date, price, and a "View Package Details" action. A horizontal status filter bar (All / Active / Expired / Exhausted) sits above the list.

**On success:** Package instances load and display with real-time credit usage visualized as a progress bar.

**On failure / error states:**
- Loading: 3 skeleton cards animate in.
- Empty state: "No Packages Yet" with a "Buy Package" CTA that navigates to the purchase flow.

---

## 2. How It Works

**Execution flow:**
```
PackagesScreen
  → useOrganization() → organizationId
  → useQuery(orpc.packageInstances.listForClient, { organizationId, status? }) → packageInstances
  → Map to display shape: packageName, totalCredits, remainingCredits, purchaseDate, status, price, imageUrl, expiresAt
  → Pull-to-refresh: calls refetch()
  → useFocusEffect: hides tab bar via parent navigator traversal
  → Tap "View Package Details" → router.push("/dashboard/bookings/[id]", { id: pkg.id })
  → Empty CTA / header "Buy Package" → router.push("/dashboard/buy-package/setup")
```

**Inputs:**
- `statusFilter: "all" | "active" | "expired" | "exhausted"` — local state; passed as `status` param (undefined when "all")

**State management:**
- `statusFilter: StatusFilter` — active tab
- `refreshing: boolean` — pull-to-refresh indicator

**Outputs:**
- Package cards with progress bars and status badges
- Expiry countdown text (shown only for active packages within 30 days of expiry)

**Side effects:**
- Hides tab bar on focus (no restore on blur — intentional for this screen's position outside the main tab group).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `packageInstances.listForClient` — `{ organizationId, status? }` — lists package instances owned by the session user

**Uses these components:**
- `Container` — `apps/native/components/container.tsx`
- `useOrganization` — `apps/native/hooks/useOrganization.ts`
- `SkeletonCard` — local inline component

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/index.tsx` — "My Packages" section CTA + "View All" button (`router.push("/dashboard/packages")`)
- `apps/native/app/(app)/dashboard/bookings/index.tsx` — "Buy Package" link in empty bookings state
- `apps/native/app/(app)/dashboard/buy-package/done.tsx` — after purchase completion (`router.replace("/dashboard/packages")`)

**Navigation: where it goes:**
- `/dashboard/bookings/[id]` — "View Package Details" button; passes `{ id: pkg.id }`
- `/dashboard/buy-package/setup` — "Buy Package" empty-state CTA

---

## 4. Data Shapes

**DB tables touched (via API):**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `package_instances` | SELECT | `id`, `clientId`, `status`, `creditsTotal`, `creditsRemaining`, `createdAt`, `totalPrice`, `expiresAt`, `startsAt` |
| `services` (joined as `package`) | SELECT | `name`, `appointmentType`, `imageUrl` |

**Local display shape:**
```typescript
{
  id: string
  packageName: string      // inst.package?.name ?? "Package"
  totalCredits: number
  remainingCredits: number
  purchaseDate: string     // formatted date string
  status: "active" | "expired" | "exhausted" | "cancelled" | "pending"
  price: number
  category: string         // inst.package?.appointmentType ?? ""
  imageUrl: string
  expiresAt: string | null
  startsAt: string | null
}
```

**Status badges:**
| Status | Background | Text color |
|--------|------------|------------|
| active | `#DCFCE7` | `#16A34A` |
| expired | `#FEE2E2` | `#DC2626` |
| exhausted | `#FEF3C7` | `#D97706` |
| cancelled | `#F3F4F6` | `#6B7280` |
| pending | `#FEF3C7` | `#D97706` |

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- "View Package Details" navigates to `/dashboard/bookings/[id]` using the package instance ID, not a booking ID — this may be incorrect if the bookings detail screen expects an appointment/booking ID.
- Tab bar hide does not restore on blur (unlike other detail screens that use `useFocusEffect` cleanup) — potential tab bar disappearance if navigated back.
- `getExpiryText` expiry warning logic: `!expiryText.includes("30")` is a string check that could produce incorrect coloring edge cases.

---

## 6. Notes

- Progress bar uses `(usedCredits / totalCredits) * 100` — renders as 0% when `totalCredits === 0` (guard prevents divide-by-zero).
- Expiry countdown only displays for `status === "active"` packages.
- Price displayed with `pkg.price.toFixed(2)` using a hardcoded `$` prefix.
- The tab bar hiding in `useFocusEffect` traverses up to 5 parent navigators looking for a tabs navigator — same fragile pattern as other screens.
- `DEFAULT_IMAGE` fallback is an Unsplash URL; requires network.
