# Memberships (Legacy Redirect)

**Route:** `/dashboard/memberships/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/memberships/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Note: This is a LEGACY redirect stub. Do not extend.**

**Purpose:** Redirect to `/dashboard/packages/view` with tab parameter `memberships`.

**Behavior:** On route access, `beforeLoad` hook triggers `makeTabRedirect()` which navigates away immediately.

**Produces:** HTTP redirect (no component render).

**On success:** User is redirected to `/dashboard/packages/view?tab=memberships`.

**On failure / error states:** None; redirect is synchronous.

---

## 2. How It Works

**Execution flow:**  
1. Route matches `/dashboard/memberships/view`
2. `beforeLoad` hook calls `makeTabRedirect("/dashboard/packages/view", "memberships")`
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
- `/dashboard/packages/view` (tab=memberships)

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
- **Consolidation**: Memberships are now under the Packages tab instead of separate route
- **Helper utility**: `makeTabRedirect()` from `@/lib/tab-redirect` handles the redirect logic

