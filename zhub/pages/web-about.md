# About Page

**Route:** `/about`
**File:** `apps/web/src/routes/about.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Public static "About Avantej" page presenting the company story, values, and leadership team.
**Produces:** Two-section page: (1) hero with company mission statement, (2) "Our Story" text + "Our Values" card (3 values) + leadership team grid (4 placeholder profiles).
**On success:** Static content renders immediately — no data fetching.
**On failure / error states:** No error states — purely static render.

---

## 2. How It Works

**Execution flow:**
```
AboutPage → renders static JSX
```

**Inputs:** None
**State management:** None
**Outputs:** Static about page
**Side effects:** None

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Check` icon from `lucide-react` — used in values list items

**Uses these hooks:** None

**Navigation: who navigates here:** Direct URL `/about` — no nav links found pointing here in sidebar or landing page

**Navigation: where it goes:** No outbound links on this page

---

## 4. Data Shapes

No data shapes — fully static content.

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** N/A — static page

---

## 6. Notes

- Leadership team profiles (Sarah Johnson, Michael Chen, Amanda Rodriguez, David Kim) use gray placeholder circles — no actual photos.
- The same names appear in the testimonials section of `index.tsx` as both customers and leadership — clearly placeholder copy.
- This page is not linked from anywhere visible in the codebase (no sidebar link, not referenced from landing page). Likely a stub for future use.
- Users must use browser back to leave this page — no navigation links back to landing or login.
