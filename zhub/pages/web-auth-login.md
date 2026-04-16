# Login

**Route:** `/login`
**File:** `apps/web/src/routes/(auth)/login.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Allows existing users to sign in to Avantej with their email and password.

**Produces:** An authenticated Better-Auth session cookie; the user is redirected to `/dashboard` (or `/accept-invitation` if arriving from an invitation link).

**On success:** `toast.success("Login successful")` shown; navigation to `/dashboard` or `/accept-invitation`.
**On failure / error states:** `toast.error(...)` shown with server error message. Already-authenticated users are automatically redirected away to `/dashboard` via `useEffect`.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → <LoginForm />
    → useAuth()                       # wraps Better-Auth session + user context
      → authClient.useSession()       # reads Better-Auth cookie session
      → useUserContext()              # fetches org/hierarchy data when session exists
    → form.onSubmit → login()
      → authClient.signIn.email()     # Better-Auth: POST /api/auth/sign-in/email
        → sets HTTP-only session cookie
      → refetch()                     # refresh TanStack Query session
```

**Inputs:**
- `email` — text, required, validated as email
- `password` — text, required, min 8 chars
- Query params (passed through if present): `invitationToken`, `orgId` — forwarded to `/accept-invitation` after successful login

**State management:**
- `useAuth()` — reads `authClient.useSession()` for auth state
- `useSearch({ strict: false })` — reads `invitationToken` and `orgId` query params
- TanStack Form manages field state and validation

**Outputs:** Renders a centered card with email/password fields, "Or continue with" OAuth section (disabled, "coming soon"), and a link to `/signup`. Shows a decorative image panel on desktop.

**Side effects:** Sets Better-Auth session cookie. Clears no caches on login (cache refresh happens via `useUserContext` reacting to new session).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `authClient.signIn.email` — Better-Auth sign-in via POST `/api/auth/sign-in/email`

**Uses these components:**
- `LoginForm` — `apps/web/src/components/forms/login-form.tsx` — the full login form

**Uses these hooks:**
- `useAuth` — `apps/web/src/hooks/useAuth.ts` — wraps Better-Auth session and exposes `login`, `logout`, user state

**Navigation: who navigates here:**
- `apps/web/src/hooks/useAuth.ts` — `logout()` always redirects to `/login`
- `apps/web/src/routes/(auth)/setup-password.tsx` — redirects here on expired/invalid/already-set tokens
- `apps/web/src/routes/accept-invitation.tsx` — "Log in to accept invitation" button navigates here with `invitationToken` + `orgId` query params
- `apps/web/src/components/forms/signup-form.tsx` — redirects here when user already exists
- `apps/web/src/routes/_authenticated.tsx` — unauthenticated guard redirect (inferred)

**Navigation: where it goes:**
- `/dashboard` — successful login (no invitation params)
- `/accept-invitation?token=...&orgId=...` — successful login with invitation query params

---

## 4. Data Shapes

**DB tables touched:**
None directly (Better-Auth manages session cookies; session stored in Better-Auth tables).

**Key types / Zod schemas:**
- Form: `{ email: string (email), password: string (min 8) }`
- `authClient.signIn.email` returns Better-Auth session + user object

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| `email` | email | required, valid email | `authClient.signIn.email({ email })` |
| `password` | password | required, min 8 chars | `authClient.signIn.email({ password })` |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Login with wrong credentials, redirect after login with invitation params, already-authenticated redirect loop.

---

## 6. Notes

- Uses `@tanstack/react-form` (not `react-hook-form`) — different from most other forms in the codebase which use `react-hook-form` + `zodResolver`.
- OAuth buttons (Apple, Google, Meta) are rendered but disabled with `cursor-not-allowed`; labelled "Coming soon".
- The `useAuth` hook also fetches user context (organizations/hierarchy) via `useUserContext`; this adds a second async call after session is confirmed.
- `invitationToken` and `orgId` query params are forwarded through login so invitation acceptance flow continues seamlessly.
