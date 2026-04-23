# Features Page

**Route:** `/features`
**File:** `apps/web/src/routes/features.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Detailed showcase of all Avantej platform features organized into three main categories: core features, additional features, and system features.

**Produces:** Static page with hero section, feature cards in three grids: 6 core features (Dashboard, Scoreboards, Client Management, Calendar, Payroll, Admin), 6 additional features (Claims, Roles, Financial Analytics, Packages, Payments, Purchase Approval), 3 system features (Data Center, Announcements, Branding).

**On success:** User views all available features with descriptions.
**On failure / error states:** None — static content page.

---

## 2. How It Works

**Execution flow:**
1. Component mounts
2. Renders hero section (heading + description)
3. Renders three feature grids with icon + title + description for each feature

**Inputs:** None
**State management:** None
**Outputs:** Static HTML rendering
**Side effects:** None

---

## 3. What Depends On It

**Calls these API endpoints:** None
**Uses these components:** 
- Multiple lucide-react icons (HomeIcon, ClipboardList, UserCircle, Calendar, DollarSign, etc.)
- HTML divs + Tailwind classes (no shadcn/ui components used)

**Uses these hooks:** None
**Navigation: who navigates here:** None (not linked from visible pages, but linked from home page in text/buttons)
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
- Layout responsiveness on mobile (3-column grid on desktop, 1-column on mobile)
- Icon rendering consistency
- Text overflow on narrow viewports

---

## 6. Notes

- Feature content is hardcoded in component (no CMS or data fetching)
- Same features appear on home page (/index.tsx) — content duplication
- Uses same icon/card pattern as home page
- No interactive elements or state changes

