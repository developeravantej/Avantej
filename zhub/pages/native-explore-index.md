# Explore – Service Browse

**Route:** `/dashboard/explore`
**File:** `apps/native/app/(app)/dashboard/explore/index.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Browse all available services offered by the organization, with search and category filtering.

**Produces:** A scrollable list of service cards with image, name, description, and price. A horizontal category filter bar sits above the list. A "Recommended For You" section shows the first 4 results when no filter or search is active.

**On success:** Services load and display as cards. Tapping a card navigates to the service detail screen.

**On failure / error states:**
- While loading: 3 skeleton cards animate in.
- Empty state: icon + "No services found" with contextual sub-message (different for search vs. category filter).

---

## 2. How It Works

**Execution flow:**
```
ExploreScreen
  → useOrganization() → organizationId
  → useQuery(orpc.serviceCategories.list) → categories
  → useQuery(orpc.services.list, { organizationId, categoryId, isActive: true }) → services
  → useDebounce(searchQuery, 300) → debouncedSearch
  → useMemo: filter services client-side on debouncedSearch
  → Render: filter tabs + service cards
  → Tap card → router.push("/dashboard/explore/[id]", { id: service.id })
```

**Inputs:**
- Search text (local state, client-side filtered)
- Selected category ID (local state, server-side filtered via `categoryId` query param)

**State management:**
- `selectedCategoryId: string | null` — active category filter
- `searchQuery: string` — raw search input
- `debouncedSearch: string` — debounced 300ms

**Outputs:**
- "Recommended For You" section: first 4 services when no search/filter active
- "Browse Workouts" / "Search Results" / "Services" section: full filtered list

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceCategories.list` — fetches category list for filter tabs
- `services.list` — fetches services filtered by `organizationId`, optional `categoryId`, `isActive: true`

**Uses these components:**
- `TabContainer` — `apps/native/components/container.tsx` — tab-safe container with padding
- `useTabBarHeight` — `apps/native/components/container.tsx` — bottom padding for tab bar
- `useDebounce` — `apps/native/hooks/useDebounce.ts`
- `useOrganization` — `apps/native/hooks/useOrganization.ts`
- `SkeletonCard` — local inline component

**Navigation: who navigates here:**
- Tab bar (Explore tab) — always accessible from the bottom nav while authenticated

**Navigation: where it goes:**
- `/dashboard/explore/[id]` — tap on any service card; passes `{ id: service.id }`

---

## 4. Data Shapes

**DB tables touched (via API):**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `service_category_config` | SELECT | `id`, `name`, `organizationId` |
| `services` | SELECT | `id`, `name`, `description`, `price`, `type`, `categoryId`, `imageUrl`, `isActive`, `branchId` |

**Key types (from API response, cast as `any`):**
```typescript
service: {
  id: string
  name: string
  description: string | null
  price: number | null
  pricePerSession: number | null  // fallback
  type: "private" | "semi_private" | "both"
  imageUrl: string | null
  categoryId: string | null
}
```

**Note:** Price display uses `service.price ?? service.pricePerSession ?? 0` with a hardcoded `$` prefix — not locale-aware.

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Server-side search is not implemented; search is entirely client-side. Large service lists will degrade performance.
- The filter icon button (top-right) is rendered but has no `onPress` handler — it is a no-op.
- Category filter queries the server on each selection but search filters the already-fetched list; these two interact (search runs over the category-filtered result set).

---

## 6. Notes

- "Recommended For You" is implemented as `filteredServices.slice(0, 4)` — no actual recommendation logic.
- Section heading adapts: "SEARCH RESULTS" when searching, "SERVICES" when a category is selected, "BROWSE WORKOUTS" otherwise.
- `DEFAULT_IMAGE` fallback is an Unsplash URL — requires network access even when service has no imageUrl.
- The `orpc.serviceCategories.list` call uses `organizationId` from `useOrganization()` hook; no explicit error handling if this throws (org not selected).
