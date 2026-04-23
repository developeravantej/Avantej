# Brands

**Route:** `/dashboard/brands/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/brands/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** N/A — Redirect stub.

**Produces:** Redirect to `/dashboard/inventory-options?tab=brands` (before page renders).

**On success:** Browser navigates to inventory options page with brands tab active.

**On failure / error states:** None — pure redirect.

---

## 2. How It Works

**Execution flow:**
1. Route is loaded
2. `beforeLoad` hook executes `makeTabRedirect("/dashboard/inventory-options", "brands")`
3. Function throws a redirect exception to `/dashboard/inventory-options?tab=brands`
4. Page never renders (route component is not needed)

**Inputs:**
- None

**State management:**
- None (redirect before component initialization)

**Outputs:**
- HTTP redirect to `/dashboard/inventory-options`

**Side effects:**
- Router changes navigation

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None (page never renders)

**Uses these hooks:** None

**Navigation: who navigates here:**
- Unknown (can be determined by searching for links to `/dashboard/brands/view`)

**Navigation: where it goes:**
- `/dashboard/inventory-options?tab=brands`

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** Found — `/c/Project/Avantej/apps/web/src/__tests__/routes/brands.test.tsx`

**Scenarios covered:** Unknown (file not examined)

**Not tested (risk areas):** None specific to redirect logic

---

## 6. Notes

- **Redirect stub:** Consolidates brands tab into a single inventory-options page view with tab selection
- Simple wrapper using `makeTabRedirect()` utility from `@/lib/tab-redirect`
- No component logic; purely routing configuration
