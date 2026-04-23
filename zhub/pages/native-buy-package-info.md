# Info Screen

**Route:** `(app)/dashboard/buy-package/info`
**File:** `apps/native/app/(app)/dashboard/buy-package/info.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 3/7) — prev: schedule, next: plan
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Collect optional remarks/additional information from the user.

**Produces:** A multiline text input with placeholder and label "REMARK".

**On success:** Remark (or null if empty) saved to state; navigates to plan screen.

**On failure / error states:** No validation errors; input is entirely optional.

---

## 2. How It Works

**Execution flow:**
1. Mount: Load remark from context state (or empty string).
2. User types in TextInput → local state updated via `setRemark()`.
3. Continue button calls `update({ remark: remark || null })` → push to plan.

**Inputs:**
- Navigation params: none.
- Local state: `remark` (controlled TextInput).

**State management:**
- PurchaseFlow context: provides initial remark value, stores updated remark.
- Local state: `remark` string.

**Outputs:**
- On continue: `update({ remark })`.
- Navigates to `./plan`.

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `Container` — wrapper.

**Uses these hooks:**
- `usePurchaseFlow` — read/write remark.
- `useState` — remark text state.

**Navigation: who navigates here:** `./schedule` on continue.

**Navigation: where it goes:** `./plan` on continue.

---

## 4. Data Shapes

**DB tables touched:** None (UI only; saved at payment step).

**Key types / Zod schemas:**
- `remark`: `string | null` (from PurchaseFlowState).

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Very long remark input (character limit).
- Special characters or multi-line handling.
- Emoji or RTL text rendering.
- TextInput accessibility.

---

## 6. Notes

- This is the simplest screen in the flow — minimal logic.
- `remark || null` ensures empty strings become null for consistency.
- TextInput `numberOfLines={6}` and `minHeight: 150` are hardcoded; should be flexible.
- No character limit enforced; consider adding max-length validation.
- Header image (Unsplash) same as other screens; should be replaced.
