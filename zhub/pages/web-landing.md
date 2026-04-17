# Landing Page

**Route:** `/`
**File:** `apps/web/src/routes/index.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Public marketing landing page for Avantej — communicates product value, features, pricing, and drives sign-ups.
**Produces:** Full-page marketing site with: fixed header nav, hero section, key features grid, stats section, comprehensive features grid (12 feature cards), how-it-works steps, testimonials, pricing tiers (Starter $99/Professional $299/Enterprise $599), and multiple CTAs.
**On success:** Static content renders immediately — no data fetching.
**On failure / error states:** No error states — purely static render.

---

## 2. How It Works

**Execution flow:**
```
HomeComponent
  → useSearch({ from: "/" }) → { invitationToken?, orgId? }
  → All CTAs: <Link to="/login" search={loginSearch}>
    (loginSearch passes invitationToken + orgId through to login if both present)
  → Renders static marketing content
```

**Inputs:**
- Search params (optional): `invitationToken` (string), `orgId` (string) — forwarded to login links
- `validateSearch` parses and type-checks both params; invalid types become `undefined`

**State management:** None — pure render from search params
**Outputs:** Static marketing page
**Side effects:** None

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `FeatureCard` (local) — icon + title + description card
- `StatCard` (local) — number + label stat display
- `TestimonialCard` (local) — quote + attribution
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — Shadcn pricing cards
- `buttonVariants` — Shadcn button styling utility (used with `Link`)

**Uses these hooks:**
- `useSearch` — reads `invitationToken` and `orgId` from URL search params

**Navigation: who navigates here:**
- Direct URL `/`
- Redirected here from invite links that include `invitationToken` and `orgId` params (invitation flow)

**Navigation: where it goes:**
- All CTA buttons → `/login` (with optional `invitationToken` + `orgId` search params forwarded)
- Header "Login" and "Get Started" buttons → `/login`

---

## 4. Data Shapes

**Search params schema:**
```typescript
type LandingSearch = {
  invitationToken?: string;
  orgId?: string;
}
```

**Pricing tiers (hardcoded):**
| Tier | Price | Limits |
|------|-------|--------|
| Starter | $99/mo | 3 branches, 10 staff |
| Professional | $299/mo | 10 branches, 50 staff |
| Enterprise | $599/mo | Unlimited |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Invitation token forwarding through login flow

---

## 6. Notes

- Stats section (500+ branches, 10k+ staff, 98% satisfaction, 25M+ transactions) contains hardcoded marketing copy — not real data.
- Testimonials (Sarah Johnson, Michael Chen, Amanda Rodriguez) are placeholder copy that matches the `about.tsx` leadership team names — likely fictional.
- The invitation flow: when a user clicks an email invitation link, they land on `/` with `?invitationToken=...&orgId=...`, then all "Login/Get Started" links forward these params to `/login` so the invitation can be accepted during sign-in.
- Uses `bg-brand-secondary-2` and `bg-brand-secondary-3` Tailwind custom brand color classes — these are defined in the project's Tailwind config.
- The fixed header uses `z-50` and will overlap content unless the hero has sufficient `pt-` padding (`pt-32`).
