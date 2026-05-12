# UoM Conversions (Redirect)

**Route:** `/dashboard/uom-conversions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom-conversions/view.tsx`
**Platform:** web
**Auth required:** None (redirect applies no guard)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Redirect stub — navigates users from `/dashboard/uom-conversions/view` to `/dashboard/uom/view?tab=conversions`.

**Produces:** No UI rendered on this route; immediate redirect via `beforeLoad`.

**On success:** Browser navigates to consolidated UoM page with conversions tab active.

**On failure / error states:** None (redirect happens before component mount).

---

## 2. How It Works

**Execution flow:**
1. Route matched: `/_authenticated/dashboard/_layout/uom-conversions/view`
2. `beforeLoad` hook: `makeTabRedirect("/dashboard/uom/view", "conversions")` executes
3. Router redirects to `/dashboard/uom/view?tab=conversions` before component mounts
4. Route guard never reached (redirect is first)

**Inputs:** None (URL path only)

**State management:** None (redirect route has no component state)

**Outputs:** Client-side navigate redirect

**Side effects:** None (component never mounts)

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None (component is empty, never mounts)

**Uses these hooks:** None

**Navigation: who navigates here:** Old links/bookmarks pointing to `/dashboard/uom-conversions/view` (if any)

**Navigation: where it goes:** `/dashboard/uom/view?tab=conversions`

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** None found (may be covered under general redirect tests)

**Scenarios covered:** N/A

**Not tested (risk areas):** None — simple redirect, no logic to test

---

## 6. Notes

- **Tab redirect pattern:** Same as transfer-orders redirect; uses `makeTabRedirect()` utility
- **Consolidation:** UoM conversions are consolidated into the UoM view (conversions tab)
- **No LEGACY comment** — but page is a backward-compatibility stub
- **No component:** Route file is minimal; no component export
- **Purpose:** Allows old URLs or bookmarks to still work without breaking links

