# Buy Package — Plan

**Route:** `(app)/dashboard/buy-package/plan`
**File:** `apps/native/app/(app)/dashboard/buy-package/plan.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 4/7) — prev: info, next: review
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** The user chooses how to split their package payment — full, half (2 installments), or quarterly (4 installments). Each option shows the per-installment amount and credits unlocked per installment.
**Produces:** A list of selectable payment plan cards filtered to those enabled on the service (`availablePaymentPlans`). Each card shows label, description, per-installment cost, and credits per installment.
**On success:** Continue tapped → paymentPlanType written to context → navigates to `./review`.
**On failure / error states:** No API calls. If only `"full"` is available (or no plans configured), this screen is auto-skipped via `router.replace("./review")` on mount.

---

## 2. How It Works

**Execution flow:**
```
PlanScreen
  → state.availablePaymentPlans filters PLAN_CONFIG keys
  → useEffect: if plans.length === 0 OR only "full" → update({ paymentPlanType: "full" }) → router.replace("./review")
  → User selects plan card
  → handleContinue → update({ paymentPlanType: selectedPlan }) → router.push("./review")
```

**Inputs:** `state.availablePaymentPlans`, `state.paymentPlanType`, `state.price`, `state.creditsTotal`
**State management:** Local `selectedPlan: PlanKey` (defaults to context value or "full"); writes to context on continue
**Outputs:** One card per available plan key from `["full", "half", "quarterly"]`
**Side effects:** Auto-navigation via `router.replace("./review")` if screen should be skipped

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper

**Context:** Reads `availablePaymentPlans`, `paymentPlanType` (pre-select), `price`, `creditsTotal`. Writes: `paymentPlanType`

**Navigation:** `./review` — on Continue tap; also `router.replace("./review")` on mount if auto-skip

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| (none) | — | — |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| availablePaymentPlans | string[] | Filters which plan cards to show |
| paymentPlanType | "full" \| "half" \| "quarterly" \| null | Pre-selects current plan; written on continue |
| price | number \| null | Divided by installment count for per-installment display |
| creditsTotal | number \| null | `Math.floor(creditsTotal / installments)` per card |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- `PLAN_CONFIG` maps: `full` = 1 installment, `half` = 2, `quarterly` = 4.
- Credits per installment uses `Math.floor` — any remainder credits are silently lost in the display (the full credit count is still stored in context).
- The auto-skip `useEffect` has an empty dependency array with an eslint-disable comment. It only fires once on mount, which is intentional — it reads `availablePaymentPlans` from closure at mount time.
- `router.replace` is used for auto-skip (not `push`) so the back button from review won't return here when there are no installment options.
- The step indicator labels show "Review" at position 4 but this screen labels itself "Plan" — the step dots labels for this screen do not match what review.tsx shows at position 4.
