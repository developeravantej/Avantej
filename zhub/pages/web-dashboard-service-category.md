# Service Category (Legacy)

**Route:** `/dashboard/service-category/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/service-category/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Stub route; redirects users to a different page.
**Produces:** User is silently redirected away from this URL.
**On success:** Navigates to `/dashboard/service/view?tab=categories`.
**On failure / error states:** None visible to user.

---

## 2. How It Works

**Execution flow:** 
1. Route matches: `/_authenticated/dashboard/_layout/service-category/view`
2. `beforeLoad` hook fires with `makeTabRedirect()`
3. Redirect triggered before component renders
4. Navigation to `/dashboard/service/view?tab=categories` with `categories` tab active

**Inputs:** None
**State management:** Route navigation via TanStack Router
**Outputs:** No component rendered (redirect happens first)
**Side effects:** User redirected; no state changes

---

## 3. What Depends On It

**Calls these API endpoints:** None (redirect happens before component mount)
**Uses these components:** None
**Uses these hooks:** None
**Navigation: who navigates here:** Anyone with a direct link or bookmark
**Navigation: where it goes:** `/dashboard/service/view?tab=categories`

---

## 4. Data Shapes

**DB tables touched:** None
**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** Redirect logic

---

## 6. Notes

LEGACY EXEMPT — marked "slated for rewrite; do not extend" per the code comment. This is a simple redirect stub; the actual Service Category CRUD is likely on the service page under a tab. No component logic to test or debug.
