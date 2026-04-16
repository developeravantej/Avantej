# Accept Invitation

**Route:** `/accept-invitation`
**File:** `apps/web/src/routes/accept-invitation.tsx:1`
**Platform:** web
**Auth required:** public (handles both authenticated and unauthenticated users)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Allows a user to accept an organization membership invitation sent via email link, handling both new users (signup inline) and existing users (auto-accept after login).

**Produces:** Creates a member record in the tenant DB, marks the invitation as accepted, stores the org ID in `localStorage`, and redirects to `/dashboard`.

**On success:** `toast.success("Successfully joined organization!")` shown; `localStorage.setItem("current_organization_id", orgId)` set; navigate to `/dashboard` after 2-second delay.
**On failure / error states:**
- Invalid/expired invitation → error card with "Invalid Invitation" heading + `errorMessage`
- UNAUTHORIZED from accept → `toast.error("Please sign up or log in...")`
- Email mismatch (logged in as different user) → `toast.warning(...)` with 10s duration
- Loading: full-page spinner
- Already processing/success: processing card with spinner or success with checkmark

---

## 2. How It Works

**Execution flow:**
```
AcceptInvitationPage (mounts)
  → useSearch → reads token, orgId from URL
  → authClient.useSession()              # check if user is logged in
  → useQuery: client.invitations.getByToken({ token, orgId })
      → invitations.getByToken (publicProcedure)
        → getInvitationByToken(token, tenantDb)
        → validateInvitation(invitation)
        → returns { invitation, isValid, error }
  → useEffect: if isValid && invitation.email
      → verifyEmailMutation: client.invitations.verifyEmailByToken(...)
        → pre-verifies invited email in control-panel DB (no-op if not found)
  → if !session && isValid → show SignupForm (embedded, with invitationEmail locked)
      → SignupForm.onSignupSuccess → handleSignupSuccess()
          → refetchSession()
          → acceptMutation.mutate()
  → if session && isValid && email matches → auto-accept:
      → acceptMutation: client.invitations.accept({ token, orgId })
          → invitations.accept (publicProcedure, checks session internally)
            → validateInvitation → check email match → createMember (dual-write)
            → mark user.emailVerified = true in control-panel DB
```

**Inputs:**
- Query params: `token` (string, required), `orgId` (string UUID, required)

**State management:**
- `authClient.useSession()` — session check
- `useQuery` (key: `["invitation", token, orgId]`) — invitation details, no retry
- `useMutation` — `verifyEmailMutation`, `acceptMutation`
- `useRef<boolean>` — `hasProcessedRef` prevents double-accept in StrictMode
- `localStorage` — writes `current_organization_id` on success

**Outputs:** Multi-state rendering:
1. Signup form (unauthenticated + valid invitation)
2. Loading spinner
3. Invalid invitation error card
4. Processing/success card

**Side effects:**
- Writes `members` record to tenant DB (via `MembershipService.createMember`)
- Writes `organizationMembers` record to control-panel DB
- Sets `user.emailVerified = true` in control-panel DB
- Updates `invitations.status` to `"accepted"` in tenant DB
- Writes `current_organization_id` to `localStorage`

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.invitations.getByToken` — fetch and validate invitation by token (publicProcedure)
- `client.invitations.verifyEmailByToken` — pre-verify invited email (publicProcedure)
- `client.invitations.accept` — accept invitation and create member (publicProcedure, checks session internally)

**Uses these components:**
- `SignupForm` — `apps/web/src/components/forms/signup-form.tsx` — embedded with `invitationEmail` locked and `onSignupSuccess` callback
- `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle` — UI
- `Button` — UI
- Icons: `Loader2`, `Mail`, `CheckCircle`, `XCircle`, `UserPlus`

**Uses these hooks:**
- `authClient.useSession` — session check + refetch
- `useQuery`, `useMutation` — TanStack Query
- `useSearch`, `useNavigate` — TanStack Router

**Navigation: who navigates here:**
- `apps/web/src/components/forms/login-form.tsx` — after successful login with `invitationToken` + `orgId` params
- `apps/web/src/components/forms/signup-form.tsx` — after signup with invitation params
- Email links (external) containing `?token=...&orgId=...`

**Navigation: where it goes:**
- `/dashboard` — after successful acceptance (2s delay)
- `/login?invitationToken=...&orgId=...` — "Log in to accept invitation" button for existing users
- `/` — "Go to Home" on invalid invitation

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `invitations` (tenant) | READ | `token`, `email`, `role`, `status`, `expiresAt` |
| `invitations` (tenant) | WRITE | `status = "accepted"` |
| `members` (tenant) | READ (exists check) | `userId` |
| `members` (tenant) | WRITE | `userId`, `organizationId`, `role`, `hierarchyScopeId` |
| `organizationMembers` (control-panel) | WRITE | `userId`, `organizationId`, `role`, `status` |
| `auth.user` (control-panel) | WRITE | `emailVerified = true` |

**Key types / Zod schemas:**
- `validateSearch` returns: `{ token: string, orgId: string }`
- `getByToken` returns: `{ invitation: { id, email, role, status, expiresAt, createdAt }, isValid: boolean, error?: string }`
- `accept` returns: `{ success: boolean, message: string, organizationId: string }`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Email mismatch warning, double-accept prevention, session propagation race after signup, invitation expiry edge case.

---

## 6. Notes

- `hasProcessedRef` guards against React StrictMode double-effect calls triggering two accept mutations.
- The `verifyEmailByToken` call runs as a fire-and-forget side effect (no UI blocking) to pre-verify invited users who may already have an unverified account, enabling them to log in.
- A 2-second `setTimeout` is used before navigating to `/dashboard` to allow the success state to render.
- `localStorage.setItem("current_organization_id", orgId)` ensures the accepted org is selected immediately when the dashboard loads.
- If the logged-in user's email does not match the invitation email, a `toast.warning` with 10-second duration is shown, but the page does NOT redirect — the user must manually log out.
