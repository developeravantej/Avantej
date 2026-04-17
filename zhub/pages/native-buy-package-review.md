# Buy Package — Review

**Route:** `(app)/dashboard/buy-package/review`
**File:** `apps/native/app/(app)/dashboard/buy-package/review.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 4/7) — prev: plan (or info if plan skipped), next: sign
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** The user sees a summary of all choices made so far — category, service, package details (credits, price, validity), preferred times (private only), and remark — before committing to sign and pay.
**Produces:** Read-only cards for each populated context field. Fields render conditionally — empty/null fields are omitted.
**On success:** Continue tapped → navigates to `./sign`. No context mutations.
**On failure / error states:** No API calls; no error states. All data comes from context.

---

## 2. How It Works

**Execution flow:**
```
ReviewScreen
  → reads state from PurchaseFlowContext (read-only)
  → renders summary cards for each field present
  → handleContinue → router.push("./sign")
```

**Inputs:** All relevant context fields read for display
**State management:** No local state; no context writes
**Outputs:** Scrollable summary; Continue button always visible
**Side effects:** None

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper

**Context:** Reads `categoryName`, `serviceName`, `packageName`, `creditsTotal`, `price`, `validityDays`, `serviceType`, `preferredTimes`, `remark`. Writes: nothing

**Navigation:** `./sign` — on Continue tap

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| (none) | — | — |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| categoryName | string \| null | Category card (omitted if null) |
| serviceName | string \| null | Service card (omitted if null) |
| packageName | string \| null | Package card header |
| creditsTotal | number \| null | Shown under package name |
| price | number \| null | Shown as formatted dollar amount |
| validityDays | number \| null | Shown as "Valid for N days" |
| serviceType | "private" \| "semi_private" \| null | Controls whether preferred times card renders |
| preferredTimes | Array<{ day: string; time: string }> | Shown only when serviceType === "private" and non-empty |
| remark | string \| null | Remark card (omitted if null) |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- This screen is purely presentational — it holds no state and makes no mutations.
- The step indicator on this screen labels step 4 as "Review", but plan.tsx also labels step 4 as "Plan" in its own progress dots — the label naming is inconsistent between the two screens.
- The "payment plan" selection (from the plan step) is not shown in the review summary — only package, times, and remark are reviewed.
- `state.price.toFixed(2)` is called with a null guard (`state.price != null`) — safe.
