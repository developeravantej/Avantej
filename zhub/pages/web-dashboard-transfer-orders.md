# Transfer Orders (Redirect)

**Route:** `/dashboard/transfer-orders/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/transfer-orders/view.tsx`
**Platform:** web
**Auth required:** None (redirect applies no guard)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Redirect stub — navigates users from `/dashboard/transfer-orders/view` to `/dashboard/stock-requests/view?tab=transfers`.

**Produces:** No UI rendered on this route; immediate redirect via `beforeLoad`.

**On success:** Browser navigates to the consolidated stock-requests page with transfers tab active.

**On failure / error states:** None (redirect happens before component mount).

---

## 2. How It Works

**Execution flow:**
1. Route matched: `/_authenticated/dashboard/_layout/transfer-orders/view`
2. `beforeLoad` hook: `makeTabRedirect("/dashboard/stock-requests/view", "transfers")` executes
3. Router redirects to `/dashboard/stock-requests/view?tab=transfers` before component mounts
4. Route guard never reached (redirect is first)

**Inputs:** None (URL path only)

**State management:** None (redirect route has no component state)

**Outputs:** HTTP redirect (or client-side navigate)

**Side effects:** None (component never mounts)

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None (component is empty, never mounts)

**Uses these hooks:** None

**Navigation: who navigates here:** Links/buttons pointing to `/dashboard/transfer-orders/view` (if any)

**Navigation: where it goes:** `/dashboard/stock-requests/view?tab=transfers`

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/transfer-orders.test.tsx`

**Scenarios covered:** (check test file)

**Not tested (risk areas):** None — this is a simple redirect utility, no logic to test beyond route matching

---

## 6. Notes

- **Tab redirect pattern:** Uses `makeTabRedirect()` utility from `@/lib/tab-redirect` to redirect to a parent page with a tab parameter
- **Consolidation:** Transfer orders are consolidated into the stock-requests view (likely as one of several tabs)
- **No LEGACY comment** — but page is essentially a stub for backward compatibility
- **Route guard:** No `beforeLoad` guard here because redirect happens first; the destination page may have its own guards
- **Empty component:** Route file has no component export, only route config

