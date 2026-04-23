# Review Screen

**Route:** `(app)/dashboard/buy-package/review`
**File:** `apps/native/app/(app)/dashboard/buy-package/review.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 4/7) — prev: plan, next: sign
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Display a read-only summary of all selections before signing and payment.

**Produces:** Review cards for category, service, package, preferred times (if private training), and remark (if provided).

**On success:** No state changes; navigates to sign screen on continue.

**On failure / error states:** No validation; all data displayed as-is from context.

---

## 2. How It Works

**Execution flow:**
1. Mount: Read all PurchaseFlow state.
2. Render cards for each completed step (category, service, package, times, remark).
3. Continue button pushes to sign (no state mutation).

**Inputs:**
- Navigation params: none.
- Context state: all fields from PurchaseFlowState (readonly).

**State management:**
- PurchaseFlow context: read-only (via `const { state } = usePurchaseFlow()`).
- No local state.

**Outputs:**
- No state mutation on continue.
- Navigates to `./sign`.

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `Container` — wrapper.

**Uses these hooks:**
- `usePurchaseFlow` — read state.

**Navigation: who navigates here:** `./plan` on continue.

**Navigation: where it goes:** `./sign` on continue.

---

## 4. Data Shapes

**DB tables touched:** None (display only).

**Key types / Zod schemas:**
- All fields from `PurchaseFlowState` (read from context).

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Missing optional fields rendering (e.g., remark, preferred times).
- Very long text truncation.
- Accessibility of icon + text combos.

---

## 6. Notes

- This is a pure display screen; no logic or interaction beyond back/continue buttons.
- Preferred times only shown if `serviceType === "private"` and times exist.
- Remark card only shown if remark text is non-empty.
- Icons used: grid, fitness, cube, time, document — ensure consistency with design system.
- No edit functionality — user must go back to previous screens to modify selections.
