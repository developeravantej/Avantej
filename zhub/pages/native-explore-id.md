# Service Detail

**Route:** `/dashboard/explore/[id]`
**File:** `apps/native/app/(app)/dashboard/explore/[id].tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** View the full details of a specific service — image, name, price, duration, type, description, and related services in the same category.

**Produces:** A scrollable detail page with a sticky bottom action bar containing "Buy Package" and "Book Now" buttons.

**On success:** Service details render with image, info cards, and related services. CTAs navigate to the appropriate flow.

**On failure / error states:**
- Loading: full-screen `ActivityIndicator`.
- Service not found (null response): "Service not found" message with a "Go Back" button.

---

## 2. How It Works

**Execution flow:**
```
ServiceDetailScreen
  → useLocalSearchParams<{ id: string }>()
  → useOrganization() → organizationId
  → useQuery(orpc.services.getById, { organizationId, id: serviceId }) → service
  → useQuery(orpc.services.list, { organizationId, categoryId: service.categoryId, isActive: true }) → relatedServices
    (enabled only when service.categoryId is available)
  → filter related: exclude current serviceId, limit 4
  → Tab bar hidden via useFocusEffect + useEffect (both trigger hideTabBar)
  → "Buy Package" → router.push("/dashboard/buy-package/setup", { preSelectedCategoryId, preSelectedServiceId })
  → "Book Now"    → router.push("/dashboard/book-workout/book-workout", { preSelectedCategoryId, preSelectedServiceId })
```

**Inputs:**
- Route param `id` — service UUID

**State management:** No local state beyond tab bar ref (`hideTabBarRef`).

**Outputs:**
- Service image, name, category, price, duration, type, description
- Related services list (tappable, navigates to another `[id]` instance)
- Bottom action bar with two CTAs

**Side effects:**
- Hides tab bar on focus; restores it on blur (via both `useFocusEffect` and `useEffect` — duplicate intentional for reliability).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `services.getById` — `{ organizationId, id }` — primary service fetch
- `services.list` — `{ organizationId, categoryId, isActive: true }` — related services

**Uses these components:**
- `Container` — `apps/native/components/container.tsx`
- `SafeAreaView` (react-native-safe-area-context) — bottom action bar safe area
- `useOrganization` — `apps/native/hooks/useOrganization.ts`

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/explore/index.tsx` — tap on any service card (recommended or browse)
- `apps/native/app/(app)/dashboard/explore/[id].tsx` — self-referential; tap on a related service card

**Navigation: where it goes:**
- `/dashboard/buy-package/setup` — "Buy Package" button; passes `{ preSelectedCategoryId, preSelectedServiceId }`
- `/dashboard/book-workout/book-workout` — "Book Now" button; passes `{ preSelectedCategoryId, preSelectedServiceId }`
- `/dashboard/explore/[id]` — tap on a related service; passes `{ id: relSvc.id }`

---

## 4. Data Shapes

**DB tables touched (via API):**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `services` | SELECT | `id`, `name`, `description`, `price`, `type`, `duration`, `durationUnitType`, `categoryId`, `imageUrl`, `branchId`, `isActive` |
| `service_category_config` | SELECT (joined) | `name` (via `service.category.name`) |

**Key types (cast as `any` in component):**
```typescript
svc: {
  id: string
  name: string
  description: string | null
  price: number | null
  pricePerSession: number | null
  type: "private" | "semi_private"
  duration: number | null
  durationUnitType: string | null
  categoryId: string | null
  imageUrl: string | null
  category?: { name: string }
}
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Tab bar double-hide via both `useFocusEffect` and `useEffect` — potential race condition on fast navigation.
- Related services query fires a second network request every time this screen is opened; no deduplication if the same category was already fetched by explore index.
- `handleBookNow` and `handleBuyPackage` both guard on `!service` but the buttons are visible before load completes (loading spinner hides entire screen, so this is safe in practice).

---

## 6. Notes

- Duration display: `"${svc.duration} ${svc.durationUnitType ?? 'minutes'}"` — falls back to "minutes" if unit is null.
- Price display uses hardcoded `$` prefix (not MYR/locale-aware).
- The tab bar is restored to a hardcoded style object (height: 80, specific colors) on show — this must match the global tab bar style defined in `_layout.tsx`.
- Both `useFocusEffect` and `useEffect` are used for tab bar hiding; the `useEffect` with 100ms timeout is a workaround for the initial render not triggering `useFocusEffect` reliably on some navigation stacks.
