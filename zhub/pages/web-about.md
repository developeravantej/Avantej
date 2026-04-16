# About

**Route:** `/about`
**File:** `apps/web/src/routes/about.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Static marketing page presenting Avantej's company story, values, and leadership team.

**Produces:** A read-only informational page with no interactive elements and no API calls.

**On success:** Page renders immediately; no loading or error states.
**On failure / error states:** None (fully static).

---

## 2. How It Works

**Execution flow:**
```
AboutPage
  → renders static JSX only
  → no hooks, no API calls, no side effects
```

**Inputs:** None.

**State management:** None.

**Outputs:** Two-section layout:
1. Hero — headline and tagline
2. "Our Story" + "Our Values" grid; leadership team grid (4 placeholder avatar circles with names/titles)

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `lucide-react` `Check` icon only — inline, not a project component

**Uses these hooks:** None.

**Navigation: who navigates here:**
- No internal `Link` or `navigate` calls to `/about` found in `apps/web/src`. Accessible via direct URL or external links (e.g., footer links on the landing page).

**Navigation: where it goes:** None (no navigation links inside this page).

---

## 4. Data Shapes

No DB tables touched. No API calls. No form fields.

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** N/A (static page; rendering regression only risk).

---

## 6. Notes

- Leadership team members (Sarah Johnson, Michael Chen, Amanda Rodriguez, David Kim) are placeholder copy with grey avatar circles — no real images or data.
- No navigation links to other pages inside this component.
- This page is part of the public marketing surface alongside `/features`, `/contact`, and `/demo`.
