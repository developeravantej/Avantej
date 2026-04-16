# Features

**Route:** `/features`
**File:** `apps/web/src/routes/features.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Static marketing page showcasing all Avantej platform capabilities organized into a visual feature grid.

**Produces:** A read-only grid of feature cards; no interactive elements beyond CSS hover effects.

**On success:** Page renders immediately; no loading or error states.
**On failure / error states:** None (fully static).

---

## 2. How It Works

**Execution flow:**
```
FeaturesPage
  → renders static JSX only
  → no hooks, no API calls, no side effects
```

**Inputs:** None.

**State management:** None.

**Outputs:** Hero section + three feature grids:
1. Core features (6 cards): Dashboard & Analytics, Performance Scoreboards, Client Management, Smart Calendar, Payroll Management, Advanced Admin Settings
2. Additional features (6 cards): Claims & Expenses, Role Management, Financial Analytics, Package Management, Payments & Invoicing, Purchase Approval
3. System features (3 cards): Data Center, Announcement System, Branding Customization

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `lucide-react` icons only (HomeIcon, ClipboardList, UserCircle, Calendar, DollarSign, Settings, FileText, UserCog, PieChart, Package, Receipt, CheckSquare, Database, Bell, Palette) — inline, not project components

**Uses these hooks:** None.

**Navigation: who navigates here:**
- No internal navigation found pointing to `/features`. Accessible via direct URL or landing page links (the `apps/web/src/routes/index.tsx` landing page mentions features in text but no verified `Link to="/features"` was found).

**Navigation: where it goes:** None (no navigation links inside this page).

---

## 4. Data Shapes

No DB tables touched. No API calls. No form fields.

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** N/A (static page).

---

## 6. Notes

- All 15 feature cards are hardcoded marketing copy; card descriptions do not link to the actual feature pages in the app dashboard.
- No hover interactions beyond Tailwind `hover:shadow-lg transition-shadow` on each card.
- This page mirrors the feature list in the landing page (`/`) feature teaser section, but with fuller descriptions.
- Part of the public marketing surface alongside `/about`, `/contact`, and `/demo`.
