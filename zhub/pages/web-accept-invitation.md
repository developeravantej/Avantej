# Accept Organization Invitation

**Route:** `/accept-invitation`
**File:** `apps/web/src/routes/accept-invitation.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Allow a user to accept an invitation to join an organization — whether they already have an account or need to sign up first.

**Produces:** One of several conditional screens — signup form (new users), loading spinner, error card, or success/processing state.

**On success:** Sets `current_organization_id` in localStorage, displays success message, redirects to `/dashboard` after 2s.

**On failure / error states:**
- Invalid/expired invitation → error card with "Go to Home" button
- Email mismatch (logged-in user has a different email) → warning telling them to sign out
- Signup error "user already exists" → redirected to `/login` carrying invitation params
- Accept error → toast with specific message

---

## 2. How It Works

**Execution flow:**
1. Validate `token` + `orgId` from search params.
2. Fetch invitation via `client.invitations.getByToken`.
3. Check session via `authClient.useSession`.
4. If logged in AND invitation valid AND email matches → auto-accept once (one-time `useRef` guard) → set localStorage org → navigate to `/dashboard`.
5. If not logged in AND invitation valid → call `verifyEmailByToken` (pre-verifies the invited email so unverified users can sign in immediately) → render `SignupForm` pre-filled with locked email.
6. After signup success → callback runs `accept` → redirect.

**Inputs:**
- Search params: `token`, `orgId`
- Session: `authClient.useSession`

**State management:**
- `useQuery` — invitation fetch
- `useMutation` — `verifyEmailByToken`, `accept`
- `useRef` — one-time auto-accept guard
- Form state owned by `SignupForm` (`react-hook-form`)

**Outputs:**
- `client.invitations.getByToken | verifyEmailByToken | accept`
- localStorage update for `current_organization_id`
- Navigation to `/dashboard` or `/login`

**Side effects:**
- Pre-verifies email for new users (lets them log in immediately post-signup without an email verification round-trip)
- Auto-accept skipped if invitation email doesn't match logged-in session email

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.invitations.getByToken({ token, organizationId })`
- `client.invitations.verifyEmailByToken({ token, organizationId })`
- `client.invitations.accept({ token, organizationId })`

**Uses these components:**
- `SignupForm` @ `apps/web/src/components/forms/signup-form.tsx` — accepts `invitationEmail` (locks email field), `invitationToken`, `orgId`, and `onSignupSuccess` callback. Falls back to search params (`invitationToken`, `orgId`) if props are missing. On "user already exists" error, redirects to `/login` carrying invitation params.
- `Card / Button` shadcn primitives, lucide icons (`UserPlus`, `Mail`, `CheckCircle`, `XCircle`, `Loader2`).

**Uses these hooks:**
- `authClient.useSession`
- `useQuery`, `useMutation`
- `useNavigate`

**Navigation in:** Email link in the invitation message; login page also forwards here when carrying invitation params.
**Navigation out:** `/dashboard` on success, `/login` if account already exists.

---

## 4. Data Shapes

**DB tables touched (backend):** `invitations`, `users`, `organization_members`.

**Key types:**
```typescript
// Validated search params
{ token: string; orgId: string }

// Invitation response
{
  invitation: { email: string; role: string; ... };
  isValid: boolean;
  error?: string;
}
```

`SignupForm` Zod schema (relevant to invitation pre-fill):
```typescript
{
  firstName: string (≥2),
  lastName: string (≥2),
  email: string (email; locked & readOnly when invitationEmail prop set),
  password: string (≥8, ≥1 uppercase, ≥1 digit),
  confirmPassword: string,
} // refined: password === confirmPassword
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Email mismatch when user is already logged in
- Race between auto-accept mutation and a fast manual logout
- localStorage write failures (e.g. quota exceeded) — silently caught today
- Signup → onSignupSuccess → accept chain when session propagation lags (currently a 300ms `setTimeout` buffer)

---

## 6. Notes

- **SignupForm refactor (2026-05-12):** form now reads `invitationToken` / `orgId` from props first, then falls back to TanStack Router `useSearch({ strict: false })`. This lets `accept-invitation` pass them explicitly while the standalone `/signup` route still works via URL search params.
- **Email pre-fill is locked** (`disabled` + `readOnly` + muted background) to prevent users from typing a different email than what the invitation was issued to.
- **"User already exists" handling:** both the Better-Auth `onError` path and the surrounding `try/catch` redirect to `/login` carrying `invitationToken` + `orgId` so the login page can resume the flow.
- **Auto-accept ref guard** ensures the mutation runs at most once even if React re-renders due to session refetch.
- **`verifyEmailByToken`** is called proactively to mark the invited email as verified in Better-Auth, avoiding a follow-up "please verify your email" round-trip.
- **2s redirect delay** after success state lets the success card actually render before navigating away.
- **localStorage error** is caught silently — user still gets navigated.
