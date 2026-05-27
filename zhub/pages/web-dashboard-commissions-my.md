# My Commissions

**Route:** `/dashboard/commissions/my`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/my.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-27

---

## 1. What It Does

**Purpose (user perspective):** N/A — Redirect stub.

**Produces:** Redirect to `/dashboard/commissions/view?tab=mine` (before page renders).

**On success:** Browser navigates to commissions view with "My Commissions" tab active.

**On failure / error states:** None — pure redirect.

---

## 2. How It Works

**Execution flow:**
1. Route is loaded
2. `beforeLoad` hook executes `makeTabRedirect("/dashboard/commissions/view", "mine")`
3. Function throws a redirect exception to `/dashboard/commissions/view?tab=mine`
4. Page never renders (route component is not needed)

**Inputs:**
- None

**State management:**
- None (redirect before component initialization)

**Outputs:**
- HTTP redirect to `/dashboard/commissions/view`

**Side effects:**
- Router changes navigation

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None (page never renders)

**Uses these hooks:** None

**Navigation: who navigates here:**
- Unknown (can be determined by searching for links to `/dashboard/commissions/my`)

**Navigation: where it goes:**
- `/dashboard/commissions/view?tab=mine`

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

- **Redirect stub:** Consolidates "my commissions" into a single view page with tab selection
- Simple wrapper using `makeTabRedirect()` utility from `@/lib/tab-redirect`
- No component logic; purely routing configuration
- Actual "My Commissions" content is rendered in `/dashboard/commissions/view` with tab="mine"

### 2026-05-27 audit-prove commission delta

- **F-11** The downstream service `commissionSplits.getMyCommissions` now filters by `earnedAt` (was `createdAt`) so "Mine" reflects when commission was earned, not when the row was inserted. Affects the "My Commissions" tab this stub redirects into.
- Source: `packages/services/src/commission-splits.service.ts:getMyCommissions`.
