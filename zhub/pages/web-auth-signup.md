# Sign Up Page

**Route:** `/signup`
**File:** `apps/web/src/routes/(auth)/signup.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Create a new Avantej account with first name, last name, email, and password. Optionally auto-accept organization invitation if invitation token/orgId in URL.

**Produces:** Sign up form with first/last name, email, password, confirm password fields; link to login page.

**On success:** Account created, user logged in, redirected to `/dashboard`, `/accept-invitation`, or callback if provided.
**On failure / error states:** Toast shows error messages (validation failures, "user already exists"). If email already exists, redirects to `/login` with invitation params preserved. Form disabled while submitting.

---

## 2. How It Works

**Execution flow:**
1. Component mounts, reads invitation token + orgId from URL search params (or accepts as props)
2. Form pre-fills email if `invitationEmail` prop provided (read-only)
3. User submits form → react-hook-form validates with Zod schema
4. `authClient.signUp.email()` called (Better-Auth) with name + password
5. On success: session refetched, callback fired (if provided) or redirect to `/accept-invitation` or `/dashboard`
6. On error "user already exists": redirects to `/login` with invitation params

**Inputs:** 
- Props: `invitationEmail?`, `invitationToken?`, `orgId?`, `onSignupSuccess?` callback
- URL search params: `invitationToken?`, `orgId?`
- Form inputs: `firstName`, `lastName`, `email`, `password`, `confirmPassword`

**State management:** 
- `useForm()` from react-hook-form + Zod resolver for validation
- `authClient.useSession()` for session state
- `useSearch()` for URL params

**Outputs:** 
- Renders signup form UI
- Mutation: `authClient.signUp.email()` call (Better-Auth)
- Navigation: to `/dashboard`, `/accept-invitation`, or `/login` (if user exists)

**Side effects:** 
- Session refetch after signup success
- 300ms delay before navigation to ensure session is propagated
- Invitation email field made read-only and pre-filled

---

## 3. What Depends On It

**Calls these API endpoints:** 
- Better-Auth `/api/auth/sign-up/email` (via `authClient.signUp.email()`)

**Uses these components:** 
- `SignupForm` — `apps/web/src/components/forms/signup-form.tsx` — wrapper, handles logic
- `Button`, `Input`, `Label`, `Form*` (FormField, FormControl, FormItem, FormLabel, FormMessage) — shadcn/ui components

**Uses these hooks:** 
- `useForm()` — react-hook-form — form state + validation
- `authClient.useSession()` — Better-Auth — session refetch
- `useNavigate()` — TanStack Router — programmatic navigation
- `useSearch()` — TanStack Router — reads URL params

**Navigation: who navigates here:** 
- `/login` — "Already have an account?" link (if no invitation)
- Landing page (`/`) — "Get Started" buttons

**Navigation: where it goes:** 
- `/dashboard` — default on successful signup
- `/accept-invitation?token=X&orgId=Y` — if invitation token/orgId present
- `/login` — if user already exists (preserves invitation params)

---

## 4. Data Shapes

**DB tables touched:** `users` (controlPanelDb, shared) — write on account creation
**Key types / Zod schemas:** 
- Input: `{ firstName, lastName, email, password, confirmPassword }` with constraints:
  - firstName/lastName: min 2 chars
  - email: valid email format
  - password: min 8 chars, must contain uppercase + number
  - confirmPassword: must match password
- Response: Better-Auth session object or error

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- Pre-filled email validation (email field is read-only, may not re-validate on form submit)
- Race condition: double-submit before first request completes
- Error handling for network failures during refetch
- Callback execution and error handling if callback throws

---

## 6. Notes

- Email field becomes read-only (and gray background) when `invitationEmail` is provided
- 300ms delay after signup before navigation to allow session to propagate to useUserContext
- Uses react-hook-form (unlike login which uses TanStack Form) — form library inconsistency
- "User already exists" detection is string-based (matches on error message keywords)
- Form button text changes based on invitation state: "Sign Up & Accept Invitation" vs. "Sign Up"

