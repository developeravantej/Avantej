# Login Page

**Route:** `/login`
**File:** `apps/web/src/routes/(auth)/login.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Sign in to an existing Avantej account with email and password, optionally accepting an organization invitation.

**Produces:** Login form with email/password fields, links to signup, "continue with" OAuth placeholders (Apple, Google, Meta, LinkedIn), login background image on desktop.

**On success:** User is authenticated and redirected to `/dashboard`, or to `/accept-invitation?token=X&orgId=Y` if invitation params present in URL.
**On failure / error states:** Toast notifications show validation errors (invalid email, password too short). Loading spinner during submission. Form disabled while request pending.

---

## 2. How It Works

**Execution flow:**
1. Component mounts, checks if user already logged in via `useAuth()` hook
2. If authenticated, redirects immediately to `/dashboard` (useEffect cleanup prevents double render)
3. User fills email + password, form validates on submit with Zod schema
4. `login()` call from `useAuth` → `authClient.signIn.email()` (Better-Auth)
5. On success: session refreshed, user redirected (with invitation params if present)
6. On error: toast shows error message, form remains

**Inputs:** 
- URL search params: `invitationToken?`, `orgId?` (for post-login redirect)
- Form inputs: `email` (string), `password` (string, min 8 chars)

**State management:** 
- `useAuth()` hook provides `user`, `isLoading`, `login()` function
- `useSearch()` hook reads query params
- `useForm()` from TanStack Form handles form state + validation

**Outputs:** 
- Renders `LoginForm` component (wrapper + styling)
- Mutations: `login()` calls Better-Auth signIn endpoint
- Navigation: to `/dashboard` or `/accept-invitation`

**Side effects:** 
- Redirects if already logged in
- Clears previous form errors on input
- Toast notifications on success/error

---

## 3. What Depends On It

**Calls these API endpoints:** 
- Better-Auth `/api/auth/sign-in/email` (via `authClient.signIn.email()`)

**Uses these components:** 
- `LoginForm` — `apps/web/src/components/forms/login-form.tsx` — renders form UI, handles submission
- `Button`, `Card`, `CardContent`, `Input`, `Label` — shadcn/ui components

**Uses these hooks:** 
- `useAuth()` — `apps/web/src/hooks/useAuth.ts` — manages session state + login logic
- `useSearch()` — TanStack Router — reads URL params
- `useNavigate()` — TanStack Router — programmatic navigation
- `useForm()` — TanStack Form — form state management

**Navigation: who navigates here:** 
- `/signup` — link to sign up instead
- Landing page (`/`) — "Login" button in header and CTA buttons

**Navigation: where it goes:** 
- `/dashboard` — on successful login (no invitation)
- `/accept-invitation?token=X&orgId=Y` — on successful login with invitation params

---

## 4. Data Shapes

**DB tables touched:** `users` (controlPanelDb, shared) — read only during authentication
**Key types / Zod schemas:** 
- Input: `{ email: string, password: string }` (min 8 chars password)
- Response from Better-Auth: `{ success: true, data: session }` or `{ success: false, error: string }`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- Redirect behavior with invalid invitation params
- Race condition if user logs out while on this page
- OAuth button click behavior (disabled/unimplemented)

---

## 6. Notes

- OAuth buttons (Apple, Google, Meta, LinkedIn) are visually rendered but disabled — marked "Coming soon" with opacity-50
- Early return after hooks prevents state update errors when already authenticated
- Form uses TanStack Form (different from signup which uses react-hook-form) — inconsistent form library usage
- Search params handling with `strict: false` allows fallback usage outside `/login` route context

