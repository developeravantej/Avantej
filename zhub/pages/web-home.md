# Home / Landing Page

**Route:** `/`
**File:** `apps/web/src/routes/index.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Marketing landing page that showcases Avantej platform features and pricing plans.

**Produces:** A static multi-section landing page with hero, feature cards, pricing tiers (Starter $99, Professional $299, Enterprise $599), testimonials, and CTA buttons.

**On success:** User clicks "Get Started" or "Login" and is taken to `/login`, optionally carrying `invitationToken` and `orgId` query params to pre-fill an invitation flow.
**On failure / error states:** No data fetching; page is entirely static so there are no loading or error states.

---

## 2. How It Works

**Execution flow:**
```
HomeComponent
  → useSearch({ from: "/" }) — reads invitationToken + orgId from URL
  → All CTA Links pass loginSearch = { invitationToken, orgId } to /login
```

**Inputs:**
- `?invitationToken` (string, optional) — forwarded to login
- `?orgId` (string, optional) — forwarded to login

**State management:** No React state; stateless component.

**Outputs:** Static JSX — hero, features grid, stats section, pricing cards, testimonials, CTA.

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `FeatureCard` — inline local component — renders icon + title + description card
- `StatCard` — inline local component — renders a number/label stat
- `TestimonialCard` — inline local component — renders a quote card
- `Card`, `CardHeader`, etc. — `@/components/ui/card` — pricing card containers
- `buttonVariants` — `@/components/ui/button` — Link styled as button

**Uses these hooks:**
- `useSearch` (TanStack Router) — reads `invitationToken` and `orgId` from URL params

**Navigation: who navigates here:**
- Default browser entry point / root route

**Navigation: where it goes:**
- `/login` — all CTAs ("Get Started", "Login", "Request Demo", "Explore All Features")

---

## 4. Data Shapes

**DB tables touched:** None.

**Key types / Zod schemas:**
```typescript
type LandingSearch = {
  invitationToken?: string;
  orgId?: string;
};
```

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):** Invitation token pass-through to login — if `invitationToken`/`orgId` are present but malformed, the login page receives them unchecked.

---

## 6. Notes

- All pricing shown ($99, $299, $599 USD) is hardcoded static content — not fetched from Stripe or any backend.
- The invitation flow is passive: this page only forwards tokens it receives; the actual acceptance logic is in the login / registration flow.
- `loginSearch` is only populated when both `invitationToken` AND `orgId` are present; a partial URL with only one param results in an empty search object forwarded to login.
