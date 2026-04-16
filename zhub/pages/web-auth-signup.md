# Signup

**Route:** `/signup`
**File:** `apps/web/src/routes/(auth)/signup.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Allows new users to create an Avantej account with their name, email, and password.

**Produces:** A new user account via Better-Auth; on success the user is redirected to `/dashboard` (or back to `/accept-invitation` if arriving via an invitation link).

**On success:** `toast.success("Account created successfully!")` shown; session refreshed; navigate to `/dashboard` or `/accept-invitation`.
**On failure / error states:**
- User already exists → `toast.info("Account already exists. Please log in...")` + redirect to `/login` (with invitation params preserved if present)
- Password/email validation errors → inline field-level error messages
- Other server errors → `toast.error(errorMessage)`

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → <SignupForm />
    → authClient.useSession()          # check current session state
    → useSearch({ strict: false })     # read optional invitationToken, orgId from URL
    → form.onSubmit → authClient.signUp.email()
        → POST /api/auth/sign-up/email  (Better-Auth)
          → creates user in control-panel DB (auth.user table)
          → sends verification email
        onSuccess:
          → refetch() session
          → if onSignupSuccess callback → call it (invitation flow)
          → else if invitationToken+orgId → navigate("/accept-invitation?...")
          → else → navigate("/dashboard")
        onError:
          → if user exists → navigate("/login")
          → else → toast.error
```

**Inputs:**
- Form fields: `firstName`, `lastName`, `email`, `password`, `confirmPassword`
- Query params (optional): `invitationToken`, `orgId` — passed through from invitation flow
- Props (when used embedded in `/accept-invitation`): `invitationEmail` (locks email field), `invitationToken`, `orgId`, `onSignupSuccess`

**State management:**
- `authClient.useSession()` — for `isPending` (disables inputs while session loads)
- `useSearch({ strict: false })` — reads invitation params from URL
- `react-hook-form` with `zodResolver` manages field state

**Outputs:** Renders a form with 5 fields. Button label changes to "Sign Up & Accept Invitation" when `invitationEmail` prop is provided. Email field is read-only if pre-filled from an invitation.

**Side effects:** Creates user account in Better-Auth / control-panel DB. Triggers verification email (handled server-side by `sendVerificationEmail`).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `authClient.signUp.email` — Better-Auth: POST `/api/auth/sign-up/email`

**Uses these components:**
- `SignupForm` — `apps/web/src/components/forms/signup-form.tsx` — the reusable form (also used in `/accept-invitation`)

**Uses these hooks:**
- `authClient.useSession` — TanStack Query powered Better-Auth session hook
- `useSearch` — TanStack Router

**Navigation: who navigates here:**
- `apps/web/src/components/forms/login-form.tsx` — "Sign up" link (possibly with invitation params)
- `apps/web/src/routes/index.tsx` — landing page CTA links (implied by route existence)

**Navigation: where it goes:**
- `/dashboard` — successful signup with no invitation
- `/accept-invitation?token=...&orgId=...` — successful signup with invitation params
- `/login` — when user already exists (with invitation params preserved if applicable)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `auth.user` (control-panel) | WRITE | `email`, `name`, `firstName`, `lastName`, `emailVerified` |

**Key types / Zod schemas:**
- Form: `{ firstName: string (min 2), lastName: string (min 2), email: string (email), password: string (min 8, uppercase, digit), confirmPassword: string }` + refine passwords match
- `SignupForm` props: `invitationEmail?: string`, `invitationToken?: string`, `orgId?: string`, `onSignupSuccess?: () => void`

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| `firstName` | text | required, min 2 chars | `authClient.signUp.email({ firstName })` |
| `lastName` | text | required, min 2 chars | `authClient.signUp.email({ lastName })` |
| `email` | email | required, valid email; locked if invited | `authClient.signUp.email({ email })` |
| `password` | password | min 8, 1 uppercase, 1 digit | `authClient.signUp.email({ password })` |
| `confirmPassword` | password | must match password | client-side only |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Invitation email lock enforcement, duplicate-user redirect with invitation params preserved, password complexity rules.

---

## 6. Notes

- `SignupForm` is a reusable component also embedded inside `/accept-invitation`; when used there, `onSignupSuccess` callback handles post-signup invitation acceptance without a page redirect.
- Email verification is required before login (server checks `emailVerified` flag); however, invitation acceptance flow pre-verifies the invited email via `invitations.verifyEmailByToken`, bypassing this requirement for invited users.
- The `invitationEmail` prop disables and makes the email field read-only to prevent signing up with a different email than the one invited.
