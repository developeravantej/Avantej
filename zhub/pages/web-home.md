# Home Page (Landing)

**Route:** `/`
**File:** `apps/web/src/routes/index.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Marketing landing page showcasing Avantej Core platform features, pricing, testimonials, and CTA to sign up or request demo.

**Produces:** Long-form marketing page with hero section, feature cards (client mgmt, financial mgmt, analytics), stats grid, comprehensive feature sections, pricing cards (Starter $99, Professional $299, Enterprise $599), testimonials, "How It Works" flow, CTA sections.

**On success:** User views content, clicks CTA buttons to navigate to login/signup.
**On failure / error states:** None — static content page. Links disabled/styled consistently.

---

## 2. How It Works

**Execution flow:**
1. Component mounts, reads optional search params (invitationToken, orgId) for passing through CTA links
2. Renders header with logo + nav (Login, Get Started buttons)
3. Renders hero section with CTA buttons, passing invitation params
4. Renders feature sections using helper components (FeatureCard, StatCard, TestimonialCard)
5. Renders pricing cards grid with Starter/Professional/Enterprise plans
6. Renders testimonials, "How It Works" steps, footer CTA sections

**Inputs:** 
- URL search params: `invitationToken?`, `orgId?` (optional, for accepting org invites)

**State management:** 
- `useSearch()` hook reads and validates search params
- Memoization via `useMemo` or component props (FeatureCard, etc.)

**Outputs:** 
- Static HTML/JSX rendered as page
- Navigation links to `/login` (with optional search params)
- All CTA buttons point to login/signup

**Side effects:** None — purely presentational

---

## 3. What Depends On It

**Calls these API endpoints:** None
**Uses these components:** 
- `Button` + `buttonVariants()` — shadcn/ui
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — shadcn/ui
- Multiple lucide-react icons (BarChart3, Users, Building2, CreditCard, etc.)
- Internal helper components: `FeatureCard`, `StatCard`, `TestimonialCard` (defined inline in this file)

**Uses these hooks:** 
- `useSearch()` — TanStack Router

**Navigation: who navigates here:** 
- Direct URL `/`
- Marketing links, referrals, organic search

**Navigation: where it goes:** 
- `/login` — "Login" button in header, CTA buttons throughout
- `/about` — (not linked on this page, but related marketing page)
- `/features` — (not linked on this page, but related marketing page)

---

## 4. Data Shapes

**DB tables touched:** None
**Key types / Zod schemas:** 
- LandingSearch (validated search params):
  ```
  {
    invitationToken?: string,
    orgId?: string
  }
  ```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- Search params validation edge cases (malformed token, missing orgId with token)
- Responsive layout on mobile/tablet (many grid sections)
- Image loading (logo_only.png, login-page-image.jpg) — broken images not tested
- Link behavior with search params — may fail if parameters aren't passed through correctly

---

## 6. Notes

- Pricing cards are hardcoded ($99, $299, $599) — not fetched from API (unlike /subscribe page which fetches plans dynamically)
- Helper components (FeatureCard, StatCard, TestimonialCard) defined as functions in same file — could be extracted to separate components file for reuse
- Search params validation in route validateSearch ensures consistent shape
- All CTA buttons pass `loginSearch` object (invitationToken + orgId if both present) through navigation
- Hero section and feature sections are duplicated/similar (both show key features) — content overlap
- No error handling needed as page is static

