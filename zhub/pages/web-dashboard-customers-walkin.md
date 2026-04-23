# Walk-In Customers (Legacy Redirect)

**Route:** `/dashboard/customers/walk-in/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Note: This is a LEGACY redirect stub. Do not extend.**

**Purpose:** Redirect to `/dashboard/customers/view` with tab parameter `registered`.

**Behavior:** On route access, `beforeLoad` hook triggers `makeTabRedirect()` which navigates away immediately.

**Produces:** HTTP redirect (no component render).

**On success:** User is redirected to `/dashboard/customers/view?tab=registered`.

**On failure / error states:** None; redirect is synchronous.

---

## 2. How It Works

**Execution flow:**  
1. Route matches `/dashboard/customers/walk-in/view`
2. `beforeLoad` hook calls `makeTabRedirect("/dashboard/customers/view", "registered")`
3. Navigation stack updated to target URL
4. No component is rendered

**Inputs:** None (route handler only).

**State management:** Navigation state (TanStack Router).

**Outputs:** Redirect to canonical URL.

**Side effects:** Browser history entry added.

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None (no component)

**Uses these hooks:** None

**Navigation: who navigates here:** 
- Old bookmarks / deep links
- Legacy UI links (if any)

**Navigation: where it goes:**  
- `/dashboard/customers/view` (tab=registered)

---

## 4. Data Shapes

N/A — redirect only.

---

## 5. Tests

**Test files:** None known

**Scenarios covered:** N/A

**Not tested:** Redirect behavior itself

---

## 6. Notes

- **Scheduled for rewrite**: Code comment says "LEGACY — slated for rewrite; do not extend"
- **Consolidation**: Suggests walk-in customers may merge with registered tab in future
- **Helper utility**: `makeTabRedirect()` from `@/lib/tab-redirect` handles the redirect logic

