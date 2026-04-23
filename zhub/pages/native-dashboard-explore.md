# Explore Services & Browse

**Route:** `(app)/dashboard/explore`
**File:** `apps/native/app/(app)/dashboard/explore/index.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Browse available fitness services, filter by category, search by name/description, and navigate to service details to book or buy packages.
**Produces:** Two-section layout: "Recommended For You" (first 4 services) + "Browse Workouts" (all filtered results). Search bar and category pill tabs at top.
**On success:** Services load; categories display as tabs; search filters in real-time.
**On failure / error states:** "No services found" empty state if search/category yields empty results. Loading skeletons while fetching.

---

## 2. How It Works

**Execution flow:**
1. Get `organizationId` from `useOrganization()` hook
2. Query categories: `orpc.serviceCategories.list({ organizationId })`
3. Build filter tabs from categories (prepend "All")
4. Track selected category via state
5. Query services: `orpc.services.list({ organizationId, categoryId?, isActive: true })`
6. On search input: debounce 300ms, then filter services locally (name/description contains)
7. Slice first 4 for "Recommended" section (only shown if no search/category selected)
8. Show "Browse" section with all filtered results
9. On service card tap: navigate to `/dashboard/explore/[id]`

**Inputs:** None (organization context)
**State management:**
- Local state: `selectedCategoryId`, `searchQuery`
- Debounced search: `debouncedSearch` (300ms delay)
- TanStack Query: `categories`, `services` queries
- TabBar height for scroll padding
**Outputs:** Scrollable TabContainer with category tabs, search bar, and service card grid
**Side effects:** Navigation to service detail on card tap

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.serviceCategories.list` — fetches available categories for filtering
- `orpc.services.list` — fetches services (filtered by category if selected, all active)
**Uses these components:**
- `TabContainer` & `useTabBarHeight` (path: `@/components/container`) — layout wrapper
**Uses these hooks:**
- `useOrganization()` — provides organizationId
- `useDebounce()` — debounces search query 300ms
- `useQuery()` from TanStack Query
**Navigation: who navigates here:** Tab navigator (explore tab)
**Navigation: where it goes:** `/dashboard/explore/[id]` (on service card tap)

---

## 4. Data Shapes

**DB tables touched:** `services`, `serviceCategories` (tenantDb, read-only)
**Key types / Zod schemas:**
Categories list input:
```
{
  organizationId: string
}
```
Category object:
```
{
  id: string
  name: string
}
```
Services list input:
```
{
  organizationId: string
  categoryId?: string (optional filter)
  isActive: boolean (true)
}
```
Service object (list):
```
{
  id: string
  name: string
  description?: string
  imageUrl?: string
  price?: number
  pricePerSession?: number
  type: "private" | "semi-private" (or similar)
  categoryId: string
}
```

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):**
- Search performance with large service lists (no server-side search, all client-side)
- Category filter with search combined (works but UX may be unclear)
- Recommended section truncation (hardcoded to first 4—what if fewer services?)
- Edge case: categories query slower than services query (race condition possible)

---

## 6. Notes

- Search is client-side; debounced 300ms to reduce re-renders. For large datasets, consider server-side search.
- "Recommended" section only shown if no active search/category filter—indicates MVP approach.
- Category tab "All" clears selection (sets to null)—good UX.
- Filter button (magnifying glass) in search bar is visible but not wired up.
- Price display: tries `price`, falls back to `pricePerSession`, defaults to 0. Ensure backend consistency.
- Service type in display: "session" for private, "class" for semi-private—hardcoded strings.
