# Buy Package - Done Screen

**Route:** `(app)/dashboard/buy-package/done`
**File:** `apps/native/app/(app)/dashboard/buy-package/done.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 7/7) — prev: pay, next: exit to packages/home
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Confirms package purchase completion and allows the user to view purchased packages or immediately start booking.

**Produces:** Success confirmation card with package details (name, credits, service type, preferred times, validity, remarks) and payment total with ~10% tax estimate.

**On success:** User sees confirmation and can navigate to View Packages, Start Booking, or Home.

**On failure / error states:** Completion always renders (payment succeeded before reaching this screen).

---

## 2. How It Works

**Execution flow:** `DoneScreen` → read `usePurchaseFlow()` state → display summary → action buttons trigger navigation

**Inputs:** `state` from PurchaseFlowContext (packageName, creditsTotal, serviceName, preferredTimes, validityDays, remark, price)

**State management:** Reads purchase-flow-context only; no local state; no queries.

**Outputs:** Displays Package Details card; on button press calls `reset()` and navigates away.

**Side effects:** Calls `reset()` on all three action buttons; uses `router.replace()` (prevents back).

---

## 3. What Depends On It

**Calls these API endpoints:** None (terminal screen post-payment)

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — SafeAreaView wrapper

**Navigation: who navigates here:** Pay screen (`/buy-package/pay`) after successful payment

**Navigation: where it goes:**
- "View My Packages" → `/dashboard/packages` (replace)
- "Start Booking" → `/dashboard/book-workout/book-workout` (replace)
- "Back to Home" → `/dashboard` (replace)

---

## 4. Data Shapes

**DB tables touched:** None (read-only from PurchaseFlowContext)

**Key types:**
- price * 1.1 gives estimated total (10% tax, hardcoded)
- preferredTimes: Array<{ day: string; time: string }>

---

## 5. Tests

**Test files:** None found

**Not tested (risk areas):** Tax calculation accuracy; context reset if flow is re-entered.

---

## 6. Notes

- Uses `router.replace()` so back button won't return to this screen.
- Tax is approximated (1.1×) — no per-region or dynamic rate lookup.
- Image source is hardcoded Unsplash URL — no fallback on load failure.
