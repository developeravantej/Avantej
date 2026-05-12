# Plan Screen

**Route:** `(app)/dashboard/buy-package/plan`
**File:** `apps/native/app/(app)/dashboard/buy-package/plan.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 4/7) — prev: info, next: review
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Select a payment plan (full, half, quarterly) based on available options for the service.

**Produces:** Radio-button-style payment plan cards showing installments, per-installment cost, and credits unlocked per installment.

**On success:** Selected plan saved to state; navigates to review screen.

**On failure / error states:**
- No payment plans available or only "full" available: auto-skip to review screen.
- Each plan card shows cost breakdown.

---

## 2. How It Works

**Execution flow:**
1. Mount: Check `availablePaymentPlans` from context.
2. If empty or only ["full"]: auto-update state with "full", push to review (no UI shown).
3. Otherwise: filter PLAN_CONFIG keys by availability, set default to "full" or first option.
4. User taps plan card → local state `selectedPlan` updated.
5. Continue button calls `update({ paymentPlanType: selectedPlan })` → push to review.

**Inputs:**
- Navigation params: none.
- Context state: `availablePaymentPlans`, `paymentPlanType` (for default), `price`, `creditsTotal`.
- Local state: `selectedPlan` (one of full/half/quarterly).

**State management:**
- PurchaseFlow context: stores selected payment plan type and available options.
- Local state: `selectedPlan` for form state.

**Outputs:**
- On continue: `update({ paymentPlanType })`.
- Navigates to `./review`.

**Side effects:** Auto-skip navigation if only full plan available (lines 54–60).

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `Container` — wrapper.

**Uses these hooks:**
- `usePurchaseFlow` — read/write payment plan.
- `useState` — selected plan state.
- `useEffect` — auto-skip logic.

**Navigation: who navigates here:** `./info` on continue.

**Navigation: where it goes:** `./review` on continue (or auto-skip).

---

## 4. Data Shapes

**DB tables touched:** None (UI only; configuration from setup step).

**Key types / Zod schemas:**
- `PlanKey`: "full" | "half" | "quarterly".
- `PLAN_CONFIG[key]`: `{ label, installments, description }`.

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Edge case: availablePaymentPlans contains unrecognized keys (not in PLAN_CONFIG).
- Auto-skip does not validate if context is correctly populated.
- Price/credits per installment calculation for fractional values.
- Division by installment count may produce floating-point artifacts.

---

## 6. Notes

- Auto-skip (lines 54–60) uses `router.replace()` to avoid stacking history.
- Step counter is hardcoded as 4/8 but other screens show 7 steps total; inconsistent.
- `creditsPerInstallment` uses `Math.floor()` — loses remainder credits; consider `ceil()` or distribution logic.
- Price breakdown shown per installment; tax calculated later at payment screen.
- Available payment plans fetched at setup; no dynamic filtering here.
