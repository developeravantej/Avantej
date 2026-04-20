# Onboarding

**Route:** `/_authenticated/onboarding`
**File:** `apps/web/src/routes/_authenticated/onboarding.tsx:1`
**Platform:** web
**Auth required:** authenticated (no RBAC check, but requires session)
**Last updated:** 2026-04-20

---

## 1. What It Does

**Purpose (user perspective):** First-time setup page where a newly authenticated user enters an organization name before proceeding to choose a subscription plan.
**Produces:** A centered card with a single "Organization Name" input field and a "Proceed to Subscription" submit button.
**On success:** Stores the entered name in `sessionStorage` under `"pendingOrgName"`, then navigates to `/subscribe`.
**On failure / error states:** Auth loading spinner while `useAuth` resolves. Submit button disabled while submitting or if validation fails.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useAuth() → { isLoading }
  → react-hook-form with zodResolver(formSchema: name min 1 max 255)
  → onSubmit(values):
      → sessionStorage.setItem("pendingOrgName", values.name)
      → navigate({ to: "/subscribe" })
```

**Inputs:**
- Optional search params: `user_id` (validated via `onboardingSearchSchema`) — declared but unused
- Form field: `name` (organization name string)

**State management:**
- react-hook-form with zodResolver
- Local state: `isSubmitting` — disables button and shows "Redirecting..." spinner during navigation

**Outputs:** Navigates to `/subscribe` — org name is passed via `sessionStorage`, not URL params.
**Side effects:** `sessionStorage.setItem("pendingOrgName", ...)` — `/subscribe` page reads this to pre-populate the org name in the subscription flow.

---

## 3. What Depends On It

**Calls these API endpoints:** None — no server calls on this page.

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle` — Shadcn card layout
- `Form`, `FormControl`, `FormField`, `FormItem`, `FormLabel` — react-hook-form + Shadcn
- `Input`, `Button` — Shadcn UI

**Uses these hooks:**
- `useAuth` — `apps/web/src/hooks/useAuth.ts` — provides `isLoading`
- `useNavigate` — TanStack Router navigation
- `useForm` (react-hook-form) with `zodResolver`

**Navigation: who navigates here:**
- `apps/web/src/routes/(auth)/setup-password.tsx` references `/onboarding`
- Likely navigated to after first login when user has no organization
- `user_id` search param suggests the auth flow can pass a user ID here

**Navigation: where it goes:**
- `/subscribe` — after name is entered and submitted

---

## 4. Data Shapes

**DB tables touched:** None

**sessionStorage written:**
| Key | Value |
|-----|-------|
| `"pendingOrgName"` | Organization name string entered by the user |

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| name | text | min 1, max 255 | `sessionStorage["pendingOrgName"]` |

**Search params schema:**
```typescript
{ user_id?: string }
```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
- sessionStorage availability (private browsing)
- `/subscribe` page correctly reading `"pendingOrgName"` on load

---

## 6. Notes

- **Significantly simplified from earlier version.** Previous version had a debounced organization name availability check (mock using `setTimeout`) and called `checkAuth()` + navigated to `/dashboard` on creation. Now it just captures the name and hands off to `/subscribe` via sessionStorage.
- No API call is made on this page — organization creation is deferred to the subscription flow.
- `user_id` search param is declared and validated but never read in the current implementation.
- The background gradient (`from-blue-50 to-indigo-100`) deviates from the app's usual white theme — this is the only page with this styling.
