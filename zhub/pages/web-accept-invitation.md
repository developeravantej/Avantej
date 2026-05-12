# Accept Organization Invitation

**Route:** `/accept-invitation`
**File:** `apps/web/src/routes/accept-invitation.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Allow a user to accept an invitation to join an organization, whether they have an existing account or not.

**Produces:** Multiple conditional screens: signup form (new users), loading spinner, error card, or success/processing state.

**On success:** Sets `current_organization_id` in localStorage, displays success message, redirects to `/dashboard` after 2s.

**On failure / error states:** Invalid invitation shows error card with "Go to Home" button. Email mismatch warns user to sign out and use correct email. Signup errors redirect to login if user already exists. Accept errors show toast with specific error message.

---

## 2. How It Works

**Execution flow:**
1. Fetch invitation by token + orgId
2. Check session; if logged in and invitation valid, auto-accept if email matches
3. If not logged in and invitation valid, show signup form pre-filled with invitation email
4. On signup success, call handleSignupSuccess → auto-accept invitation → redirect to dashboard
5. If invitation invalid or expired, show error screen

**Inputs:** Query params `token`, `orgId`; session from authClient

**State management:** TanStack Query for invitation fetch; TanStack Mutation for verifyEmail and accept; useRef for one-time processing logic

**Outputs:** API calls to `client.invitations.getByToken()`, `verifyEmailByToken()`, `accept()`; localStorage update; navigation

**Side effects:** Email pre-verification for new users; auto-accept for logged-in users with matching email; localStorage persist of orgId

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.invitations.getByToken({ token, organizationId })` — fetch invitation details
- `client.invitations.verifyEmailByToken({ token, organizationId })` — pre-verify email for new users
- `client.invitations.accept({ token, organizationId })` — accept invitation

**Uses these components:**
- `SignupForm` — `@/components/forms/signup-form` — pre-filled signup (email locked)
- `Card, CardContent, CardDescription, CardHeader, CardTitle` — `@/components/ui/card` — layout
- `Button` — `@/components/ui/button` — navigation
- `UserPlus, Mail, CheckCircle, XCircle, Loader2` — lucide-react icons

**Uses these hooks:**
- `authClient.useSession()` — Better-Auth session state
- `useQuery` — invitation data fetch
- `useMutation` — verifyEmail and accept mutations
- `useNavigate` — redirect after success

**Navigation: who navigates here:** Email links in invitation emails, login page with invitation params

**Navigation: where it goes:** `/dashboard` on success; `/login` if user already exists and needs to log in

---

## 4. Data Shapes

**DB tables touched:** (Backend: invitations, users, organization_members)

**Key types / Zod schemas:**
```typescript
// Search params (validated)
{ token: string; orgId: string }

// Invitation data (from API)
{ invitation: { email: string; role: string; ... }; isValid: boolean; error?: string }
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** None

**Not tested (risk areas):** Email mismatch edge cases, race conditions between auto-accept and signup, logout race with pending mutation, localStorage error handling

---

## 6. Notes

- SignupForm pre-fills email and locks it read-only to prevent email mismatch.
- Auto-accept logic uses useRef to ensure it runs only once even if dependencies change.
- verifyEmailByToken is called proactively to pre-verify the invited email, enabling unverified users to log in.
- Invitation verification errors show specific messages (e.g., different email address).
- localStorage.setItem() errors are silently caught to prevent flow interruption.
- 2s redirect delay allows success state to display before navigation.
