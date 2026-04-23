# Cancelled Sales

**Route:** `/dashboard/cancelled-sales/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** N/A — Redirect stub.

**Produces:** Redirect to `/dashboard/sales/view` (before page renders).

**On success:** Browser navigates to sales view page.

**On failure / error states:** None — pure redirect.

---

## 2. How It Works

**Execution flow:**
1. Route is loaded
2. `beforeLoad` hook throws a redirect to `/dashboard/sales/view`
3. Page never renders; component returns null

**Inputs:**
- None

**State management:**
- None (redirect before component initialization)

**Outputs:**
- HTTP redirect to `/dashboard/sales/view`

**Side effects:**
- Router changes navigation

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None (page never renders)

**Uses these hooks:** None

**Navigation: who navigates here:**
- Unknown (can be determined by searching for links to `/dashboard/cancelled-sales/view`)

**Navigation: where it goes:**
- `/dashboard/sales/view`

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):** None

---

## 6. Notes

- **Redirect stub:** Consolidates cancelled sales into main sales view (filter may be applied server-side or in destination component)
- No component logic; purely routing configuration
- Uses TanStack Router's `redirect()` function in `beforeLoad` hook
