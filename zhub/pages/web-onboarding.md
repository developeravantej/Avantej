# Onboarding - Organization Setup

**Route:** `/onboarding`
**File:** `apps/web/src/routes/_authenticated/onboarding.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Step 1 of the post-signup flow. Authenticated user enters an organization name to proceed to subscription setup.

**Produces:** A centered card with a gradient background, form field for organization name, submit button, and info text about next steps.

**On success:** Stores organization name in sessionStorage as `pendingOrgName`, navigates to `/subscribe` route.

**On failure / error states:** Form validation errors display below field (required, max 255 chars). Submit button disabled while validating or if errors present. Loading spinner shown during navigation.

---

## 2. How It Works

**Execution flow:** Page mounts → checks auth loading status → user enters org name → form validates with Zod → onSubmit stores name in sessionStorage → navigates to `/subscribe`

**Inputs:** Form field: organization name

**State management:** React Hook Form with Zod validation; local isSubmitting state; sessionStorage for cross-route data passing

**Outputs:** Navigation to `/subscribe` with org name in sessionStorage (not URL params)

**Side effects:** sessionStorage update; useNavigate call

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Card, CardContent, CardHeader, CardTitle` — `@/components/ui/card` — layout
- `Button` — `@/components/ui/button` — submit button
- `Input` — `@/components/ui/input` — form field
- `Form, FormControl, FormField, FormItem, FormLabel` — `@/components/ui/form` — form rendering

**Uses these hooks:**
- `useAuth` — permission/auth check (confirms user is authenticated)
- `useNavigate` — TanStack Router navigation

**Navigation: who navigates here:** From signup flow, after account creation

**Navigation: where it goes:** `/subscribe` (subscription/payment setup)

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:**
```typescript
formSchema = z.object({
  name: z.string()
    .min(1, "Organization name is required")
    .max(255, "Organization name is too long"),
})
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** None

**Not tested (risk areas):** sessionStorage reliability, cross-tab persistence, what happens if subscribe route doesn't find pendingOrgName

---

## 6. Notes

- Organization name is confirmed later during subscription completion.
- sessionStorage is used instead of URL params or context state (volatile across navigations).
- Route requires authentication via `_authenticated` path segment — non-authenticated users are blocked by layout guard.
- Loading spinner shows while auth state is being resolved on mount.
- Gradient background is from Tailwind utilities (`from-blue-50 to-indigo-100`).
