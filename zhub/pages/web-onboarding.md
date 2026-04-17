# Onboarding

**Route:** `/_authenticated/onboarding`
**File:** `apps/web/src/routes/_authenticated/onboarding.tsx:1`
**Platform:** web
**Auth required:** authenticated (no RBAC check, but requires session)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** First-time setup page where a newly authenticated user creates their organization to complete account setup.
**Produces:** A centered card with a single "Organization Name" input field with live availability checking, and a "Create Organization" submit button.
**On success:** (Currently mocked) Shows success toast, calls `checkAuth()`, then navigates to `/dashboard`.
**On failure / error states:** Auth loading spinner while `useAuth` resolves. Inline availability checking spinner. Red "✗" with error message if name is taken. Submit button disabled while checking, creating, or if name unavailable.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useAuth() → { isLoading, checkAuth }
  → react-hook-form with zodResolver(formSchema: name min 1 max 255)
  → useDebounce(watchedName, 500ms)
  → useEffect on debouncedName:
      → MOCK: setTimeout 500ms sets isAvailable = !name.startsWith("test")
      → TODO: replace with client.organizations.checkNameAvailability({ name })
  → onSubmit(values):
      → MOCK: await setTimeout(1000ms)
      → TODO: replace with client.organizations.create({ name, slug })
      → toast.success → checkAuth() → navigate("/dashboard")
```

**Inputs:**
- Optional search params: `user_id` (validated via `onboardingSearchSchema`) — declared but unused
- Form field: `name` (organization name string)

**State management:**
- react-hook-form with zodResolver
- Local state: `nameToCheck`, `isCheckingAvailability`, `isAvailable`, `isCreating`
- `useDebounce` (500ms) to throttle availability checks

**Outputs:** Toast success on organization creation; navigates to `/dashboard`
**Side effects:** `checkAuth()` called after creation to refresh auth context with new organization

---

## 3. What Depends On It

**Calls these API endpoints:** None currently — both availability check and creation are mocked with `setTimeout`
**Planned endpoints (per TODO comments in source):**
- `client.organizations.checkNameAvailability({ name })` — not yet implemented
- `client.organizations.create({ name, slug })` — not yet implemented

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle` — Shadcn card layout
- `Form`, `FormControl`, `FormField`, `FormItem`, `FormLabel` — react-hook-form + Shadcn
- `Input`, `Button` — Shadcn UI

**Uses these hooks:**
- `useAuth` — `apps/web/src/hooks/useAuth.ts` — provides `isLoading` and `checkAuth`
- `useDebounce` — `apps/web/src/hooks/useDebounce.ts` — 500ms debounce
- `useNavigate` — TanStack Router navigation
- `useForm` (react-hook-form) with `zodResolver`

**Navigation: who navigates here:**
- `apps/web/src/routes/(auth)/setup-password.tsx` references `/onboarding`
- Likely navigated to after first login when user has no organization
- `user_id` search param suggests the auth flow can pass a user ID here

**Navigation: where it goes:**
- `/dashboard` after successful organization creation

---

## 4. Data Shapes

**DB tables touched:** None (all mocked)

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| name | text | min 1, max 255 + availability | `organizations.name` (planned) |

**Search params schema:**
```typescript
{ user_id?: string }
```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Everything — entire form submission is a mock with no real API integration

---

## 6. Notes

- **This page is incomplete / placeholder.** Both the availability check and organization creation are mocked. Two explicit TODO comments mark what needs replacing.
- The mock availability rule ("names starting with 'test' are taken") is a development artifact and must be removed before production.
- `user_id` search param is declared and validated but never read in the current implementation.
- The background gradient (`from-blue-50 to-indigo-100`) deviates from the app's usual white theme — this is the only page with this styling.
- `useAuth().checkAuth()` is called after creation to refresh the auth context — correct pattern to update `userContext` with the new organization membership.
