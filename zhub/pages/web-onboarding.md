# Onboarding — Create Organization

**Route:** `/_authenticated/onboarding`
**File:** `apps/web/src/routes/_authenticated/onboarding.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** First-run wizard that collects an organization name from a newly-subscribed user and creates their organization, completing account setup before accessing the dashboard.

**Produces:** A centered card with a single "Organization Name" text field, real-time availability indicator (✓ available / ✗ taken), and a "Create Organization" submit button.

**On success:** Shows "Organization created successfully!" toast, calls `checkAuth()` to refresh the session, then navigates to `/dashboard`.
**On failure / error states:**
- Auth loading → full-screen spinner while `authLoading` is true.
- Name starts with "test" → "This organization name is already taken" inline error (mock check).
- Form submission error → `toast.error(message)`.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useAuth() — get isLoading, checkAuth
  → useForm (react-hook-form + zod) — name field, min 1 / max 255
  → useDebounce(watchedName, 500ms)
  → useEffect on debouncedName:
      → MOCK availability check (setTimeout 500ms)
      → names starting with "test" → unavailable
  → onSubmit:
      → MOCK organization creation (setTimeout 1000ms)
      → toast.success + checkAuth() + navigate("/dashboard")
```

**Inputs:**
- `?user_id` (string, optional) — search param from Stripe payment callback (not used in component logic, only validated)
- "Organization Name" form field: string, min 1, max 255 chars

**State management:** react-hook-form for form state; local `useState` for availability check state and `isCreating` flag; `useDebounce` for 500ms debounce on name input.

**Outputs:** Form card with availability feedback, submit button with loading state.

**Side effects:**
- Mock: no real API calls are made (both availability check and org creation are `setTimeout` mocks).
- On success (mock): `checkAuth()` refetches Better-Auth session; navigates to `/dashboard`.

---

## 3. What Depends On It

**Calls these API endpoints:** None currently (both calls are mocked with `setTimeout`).

**Pending integrations (noted in source comments):**
- `client.organizations.checkNameAvailability({ name })` — name availability check
- `client.organizations.create({ name, slug })` — org creation

**Uses these components:**
- `Card`, `CardHeader`, `CardTitle`, `CardContent` — `@/components/ui/card`
- `Button`, `Input` — `@/components/ui/button`, `@/components/ui/input`
- `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl` — `@/components/ui/form`

**Uses these hooks:**
- `useAuth` — `@/hooks/useAuth` — `isLoading`, `checkAuth`
- `useForm` (react-hook-form + zodResolver) — form state
- `useDebounce` — `@/hooks/useDebounce` — 500ms debounce on name
- `useNavigate` — TanStack Router — redirect to `/dashboard`

**Navigation: who navigates here:**
- `apps/web/src/routes/subscribe.tsx:186` — after successful payment when `requires_onboarding` metadata flag is true
- `apps/web/src/routes/(auth)/setup-password.tsx:159` — after password setup for new guest users

**Navigation: where it goes:**
- `/dashboard` — on successful organization creation

---

## 4. Data Shapes

**DB tables touched:** None (mocked).

**Zod schema:**
```typescript
const formSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(255),
});

const onboardingSearchSchema = z.object({
  user_id: z.string().optional(),
});
```

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| name | text | required, 1-255 chars | organization name (pending real API) |

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- The entire core flow (availability check, org creation) is mocked — when real APIs are wired in, all behavior needs re-testing.
- `checkAuth()` after mock creation refreshes the session but the org may not be in the session yet (mock doesn't create a real org).
- No slug generation logic is shown — the comment mentions `{ name, slug }` but slug is not derived anywhere in the component.

---

## 6. Notes

- Both the name availability check and the org creation are explicitly marked with `// TODO: Replace with actual API call` comments — this page is a UI shell awaiting backend integration.
- The mock availability check blocks names starting with "test" (case-insensitive) — this will confuse testing if kept when real APIs land.
- `?user_id` search param is declared in `validateSearch` but never read inside the component — it exists to receive the param from the Stripe payment flow without throwing a validation error.
- `useDebounce` is imported from `@/hooks/useDebounce` (capital D in hook name per project convention).
