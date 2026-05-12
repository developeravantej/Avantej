# About Page

**Route:** `/about`
**File:** `apps/web/src/routes/about.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Tells the story of Avantej company — mission, values, leadership team, and customer success focus.

**Produces:** Static page with hero section, "Our Story" narrative + "Our Values" (Customer Success, Innovation, Integrity), leadership team photos/names/titles (4 founders).

**On success:** User reads about company and team.
**On failure / error states:** None — static content page.

---

## 2. How It Works

**Execution flow:**
1. Component mounts
2. Renders hero section (heading + tagline)
3. Renders two-column section: story text (left) + values list (right)
4. Renders leadership team grid (4 people with placeholder avatars)

**Inputs:** None
**State management:** None
**Outputs:** Static HTML rendering
**Side effects:** None

---

## 3. What Depends On It

**Calls these API endpoints:** None
**Uses these components:** 
- `Check` icon — lucide-react
- HTML divs + Tailwind classes (no shadcn/ui components)

**Uses these hooks:** None
**Navigation: who navigates here:** None (not linked from other pages in codebase)
**Navigation: where it goes:** None

---

## 4. Data Shapes

**DB tables touched:** None
**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- Image loading (placeholder avatars are empty divs with bg-gray-200)
- Text truncation on narrow viewports
- Leadership team grid responsiveness

---

## 6. Notes

- Very minimal, static page
- Leadership team members have placeholder gray circles instead of actual images
- Founded year hardcoded as 2018
- No links or navigation on this page

