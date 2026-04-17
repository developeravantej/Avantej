# Buy Package — Done

**Route:** `(app)/dashboard/buy-package/done`
**File:** `apps/native/app/(app)/dashboard/buy-package/done.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 7/7, final) — prev: pay, next: exit flow
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Confirms the purchase was successful. Shows a summary of the purchased package and offers three navigation options: view packages, start booking, or return home.
**Produces:** A green checkmark success icon, "Package Purchased!" heading, package summary card (package name, credits, service, preferred times, validity, remark, total paid), and three action buttons.
**On success:** Any button tap → `reset()` clears all flow context → navigates away.
**On failure / error states:** No API calls; no error states. If the user reaches this screen it means pay.tsx succeeded.

---

## 2. How It Works

**Execution flow:**
```
DoneScreen
  → reads state for display (read-only)
  → handleGoHome → reset() → router.replace("/dashboard")
  → handleViewPackages → reset() → router.replace("/dashboard/packages")
  → handleStartBooking → reset() → router.replace("/dashboard/book-workout/book-workout")
```

**Inputs:** Context state for display; back button tap triggers `handleGoHome`
**State management:** No local state; calls `reset()` on any exit to clear PurchaseFlowContext
**Outputs:** Success UI with summary card and three action buttons
**Side effects:** `reset()` clears entire PurchaseFlowContext state

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper

**Context:** Reads `packageName`, `creditsTotal`, `serviceName`, `serviceType`, `preferredTimes`, `validityDays`, `remark`, `price`. Calls `reset()` on exit.

**Navigation:**
- `/dashboard` — "Back to Home" button or back arrow
- `/dashboard/packages` — "View My Packages" button
- `/dashboard/book-workout/book-workout` — "Start Booking" button

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| (none) | — | — |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| packageName | string \| null | Summary card header |
| creditsTotal | number \| null | "N credits included" |
| serviceName | string \| null | Service row |
| serviceType | "private" \| "semi_private" \| null | Controls preferred times display |
| preferredTimes | Array<{ day: string; time: string }> | Shown only when serviceType === "private" |
| validityDays | number \| null | "N days from purchase" |
| remark | string \| null | Remark row (omitted if null) |
| price | number \| null | `total = price * 1.1` (approximate with tax) |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- The `total` displayed is `state.price * 1.1` — a hardcoded 10% tax approximation. This does not use the actual tax rate fetched in pay.tsx (`taxRates.getDefault`). The displayed "Total Paid" may differ from the actual amount charged if the org's tax rate is not exactly 10%.
- `reset()` is called on all three exit paths, including the back arrow. This means pressing back on this screen behaves the same as "Back to Home" — it navigates to dashboard, not back to pay.tsx.
- The step indicator on this screen shows all 7 steps as completed with checkmarks (correct terminal state).
- The `packageInstanceId` (stored in context after pay.tsx) is not used or displayed on this screen.
- All three navigation targets use `router.replace` (not `push`) to prevent returning to the flow via the back button.
