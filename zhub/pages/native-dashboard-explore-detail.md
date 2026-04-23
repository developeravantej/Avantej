# Service Details & Booking

**Route:** `(app)/dashboard/explore/:id`
**File:** `apps/native/app/(app)/dashboard/explore/[id].tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Shows full service details (image, price, duration, description) and displays related services. Two action buttons: "Book Now" and "Buy Package".
**Produces:** Full-screen detail view with service image, metadata cards (duration, type), description, related services carousel (up to 4), bottom action bar.
**On success:** Service loads; related services displayed; buttons navigate to booking/package flows.
**On failure / error states:** "Service not found" + back button; loading spinner while fetching.

---

## 2. How It Works

**Execution flow:**
1. Extract `id` from route params via `useLocalSearchParams()`
2. Get `organizationId` from `useOrganization()` hook
3. Query service detail: `orpc.services.getById({ organizationId, id })`
4. Once service loads, query related services: `orpc.services.list({ organizationId, categoryId: service.categoryId, isActive: true })`
5. Filter related: exclude self, slice first 4
6. Hide tab bar on mount (via navigation recursion)
7. Render scrollable detail with image, metadata, description
8. List related services in carousel-like view (tappable to navigate to same screen)
9. On "Book Now": navigate to `/dashboard/book-workout/book-workout` with pre-selected service
10. On "Buy Package": navigate to `/dashboard/buy-package/setup` with pre-selected service

**Inputs:** Route param `id` (serviceId)
**State management:**
- TanStack Query: `service`, `relatedServices` queries
- `useRef` to track tab bar visibility state
- Tab bar managed via parent navigator `setOptions()`
**Outputs:** Scrollable Container with detail sections
**Side effects:** Tab bar hidden on focus; navigation to booking/package flows

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.services.getById` — fetches single service detail
- `orpc.services.list` — fetches related services in same category
**Uses these components:**
- `Container` (path: `@/components/container`) — root layout
- `SafeAreaView` (path: `react-native-safe-area-context`) — bottom button safe area
**Uses these hooks:**
- `useOrganization()` — provides organizationId
- `useFocusEffect()`, `useNavigation()` — tab bar visibility control
- `useQuery()` from TanStack Query
- `useLocalSearchParams()` — route param parsing
**Navigation: who navigates here:** From `/dashboard/explore` service card tap
**Navigation: where it goes:**
  - `/dashboard/book-workout/book-workout` (Book Now, with pre-selected service)
  - `/dashboard/buy-package/setup` (Buy Package, with pre-selected service)

---

## 4. Data Shapes

**DB tables touched:** `services` (tenantDb, read-only)
**Key types / Zod schemas:**
Input to `getById`:
```
{
  organizationId: string
  id: string (serviceId)
}
```
Service object (full):
```
{
  id: string
  name: string
  description?: string
  imageUrl?: string
  price?: number
  pricePerSession?: number
  type: "private" | "semi-private"
  duration?: number
  durationUnitType?: string (e.g., "minutes")
  categoryId: string
  category?: {
    id: string
    name: string
  }
}
```
Input to `list` (related services):
```
{
  organizationId: string
  categoryId: string
  isActive: boolean (true)
}
```

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):**
- Tab bar visibility logic (recursively finds parent—fragile)
- Race condition: related services query depends on service query (chained, not parallel)
- Navigation params pre-selection (assumes booking/package screens accept these params)
- Edge case: service without category (related services query would fail)
- Circular navigation: user navigates to related service, then back (potential for loops)

---

## 6. Notes

- Tab bar hiding logic mirrors booking detail screen—same recursion pattern.
- Related services fetched only after main service loads—sequential, not parallel (minor perf impact).
- Related services limited to 4 hardcoded—may need to show more or paginate.
- Price display: tries `price`, falls back to `pricePerSession`, displays 0 if missing.
- Duration display: shows duration + unit (e.g., "60 minutes"); unit defaults to "minutes" if not specified.
- Related service tap navigates to same screen with new serviceId—smooth but creates potential redirect chain.
- "Book Now" button is blue (hardcoded #2563EB); "Buy Package" is outlined (primary color).
