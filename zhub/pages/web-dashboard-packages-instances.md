# Packages Instances (Redirect)

**Route:** `/dashboard/packages/instances/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Redirect stub; no functional page.
**Produces:** Immediate client-side redirect to `/dashboard/packages/view?tab=session-packs`.
**On success:** User lands on the main packages page with the Session Packs tab active.
**On failure / error states:** None — redirect is synchronous.

---

## 2. How It Works

**Execution flow:** Route load → `beforeLoad` hook → `makeTabRedirect()` → programmatic redirect
**Inputs:** None (URL is ignored)
**State management:** N/A
**Outputs:** Navigation to packages view
**Side effects:** Router navigation; browser history updated

---

## 3. What Depends On It

**Calls these API endpoints:** None
**Uses these components:** None
**Uses these hooks:** N/A
**Navigation: who navigates here:** Possibly legacy bookmarks or direct URL entry
**Navigation: where it goes:** `/dashboard/packages/view?tab=session-packs`

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

- Marked "LEGACY — slated for rewrite; do not extend"
- Consolidates session-packs tab into the main packages page for DX
