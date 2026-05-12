# Suppliers (Legacy)

**Route:** `/dashboard/suppliers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/suppliers/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Stub route; redirects users to a different page.
**Produces:** User is silently redirected away from this URL.
**On success:** Navigates to `/dashboard/inventory-options?tab=suppliers`.
**On failure / error states:** None visible to user.

---

## 2. How It Works

**Execution flow:**
1. Route matches: `/_authenticated/dashboard/_layout/suppliers/view`
2. `beforeLoad` hook fires with `makeTabRedirect()`
3. Redirect triggered before component renders
4. Navigation to `/dashboard/inventory-options?tab=suppliers` with `suppliers` tab active

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
**Navigation: where it goes:** `/dashboard/inventory-options?tab=suppliers`

---

## 4. Data Shapes

**DB tables touched:** None
**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** `src/__tests__/routes/suppliers.test.tsx`
**Scenarios covered:**
- Renders without crashing (attempts to render the redirect stub)
- Calls `client.suppliers.list` (implies test mocks the component, not the redirect)
- Shows supplier data in table
- Supplier list displays name, contact person, email, phone

**Not tested (risk areas):** Redirect logic (tests mock router, so redirect is not executed)

---

## 6. Notes

LEGACY STUB — This page is a simple redirect to the inventory options page under the suppliers tab. The actual Suppliers CRUD is likely on that page. The test file references supplier CRUD operations (create, update, deactivate), suggesting the test was written before or expects the real component to exist here, but currently it just redirects.

The route file is minimal: just the redirect hook. No component logic to test or debug.
