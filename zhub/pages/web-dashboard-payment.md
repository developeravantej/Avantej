# Payment (Redirect)

**Route:** `/dashboard/payment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Redirect stub; no functional page.
**Produces:** Immediate server-side redirect to `/dashboard/sales/view`.
**On success:** User lands on sales dashboard.
**On failure / error states:** None — redirect is synchronous.

---

## 2. How It Works

**Execution flow:** Route load → `beforeLoad` hook → `throw redirect()` → TanStack Router intercepts → navigates to new route
**Inputs:** None (URL is ignored)
**State management:** N/A
**Outputs:** Navigation to sales view
**Side effects:** Router navigation

---

## 3. What Depends On It

**Calls these API endpoints:** None
**Uses these components:** None
**Uses these hooks:** N/A
**Navigation: who navigates here:** Possibly legacy bookmarks or old links
**Navigation: where it goes:** `/dashboard/sales/view`

---

## 4. Data Shapes

**DB tables touched:** None
**Key types / Zod schemas:** N/A

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Redirect behavior

---

## 6. Notes

- Route component returns null (unreachable)
- Redirect happens before render via beforeLoad
