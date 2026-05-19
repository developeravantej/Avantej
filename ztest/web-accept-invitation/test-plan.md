# Test Plan: Accept Invitation Page

**Route:** `/accept-invitation`
**Auth required:** partially (auto-accepts if logged in with matching email)
**Last round:** 1

## Preconditions
- App running at localhost:3001, server at localhost:3000
- A valid invitation token and orgId (from invitation email link)
- Test with: logged-in user whose email matches invitation, logged-in user with wrong email, logged-out user
- Invitation created via `/dashboard/access-control/user-assignment`

## Test Cases

### TC-01: Page loads with valid token and orgId
**Trigger:** Navigate to `/accept-invitation?token=<t>&orgId=<id>`
**Steps:**
1. Navigate to the URL with valid params
2. Wait for invitation data to load
**Expected:**
- Page renders (may show loading or card based on session state)
- `client.invitations.getByToken({ token, organizationId })` called

### TC-02: Logged-in user, matching email — auto-accept
**Trigger:** Navigate as user whose email matches invitation
**Steps:**
1. Log in as franchisee@gmail.com
2. Navigate to `/accept-invitation?token=<token_sent_to_franchisee@gmail.com>&orgId=<id>`
**Expected:**
- Auto-accept triggered (no user action needed)
- `client.invitations.accept()` called
- Toast: "Successfully joined organization!"
- After 2s: navigated to `/dashboard`
- `localStorage["current_organization_id"]` set to orgId

### TC-03: Logged-in user, wrong email — warning shown
**Trigger:** Navigate as user whose email does NOT match invitation
**Steps:**
1. Log in as franchisee@gmail.com
2. Navigate to invitation link sent to different@email.com
**Expected:**
- No auto-accept
- Toast warning: "This invitation was sent to [other email]. You're signed in as [your email]. Please sign out and use the correct email."
- Duration 10 seconds

### TC-04: Logged-out user with SignupForm shown
**Trigger:** Navigate to invitation URL while logged out
**Steps:**
1. Ensure logged out
2. Navigate to `/accept-invitation?token=<t>&orgId=<id>`
**Expected:**
- SignupForm component rendered (for new user to register)
- Invitation context preserved

### TC-05: Invalid token — error state
**Trigger:** Navigate with invalid token
**Steps:**
1. Navigate to `/accept-invitation?token=badtoken&orgId=validorgid`
**Expected:**
- `client.invitations.getByToken()` throws/returns error
- Error state displayed (invitation not found or expired message)
- `retry: false` means no retries

### TC-06: Missing token or orgId
**Trigger:** Navigate without required params
**Steps:**
1. Navigate to `/accept-invitation?token=&orgId=`
2. Or navigate to `/accept-invitation` with no params
**Expected:**
- Query is disabled (`enabled: !!token && !!orgId` is false)
- `isValid` remains undefined/falsy
- Some loading/error message shown

### TC-07: Accept invitation — manual accept (logged in, valid, matching)
**Trigger:** If accept mutation needs explicit trigger
**Steps:**
1. Logged in, matching email, valid invitation
2. Observe useEffect auto-accepting
**Expected:**
- `acceptMutation.mutate()` called once (hasProcessedRef prevents duplicates)
- Success toast shown

### TC-08: Accept mutation error — wrong email mismatch server-side
**Trigger:** Server-side email check fails
**Steps:**
1. Attempt accept with email mismatch not caught client-side
**Expected:**
- Error toast: "This invitation was sent to a different email address" (from `errorMessage` handler)

### TC-09: Email pre-verification side effect
**Trigger:** Valid invitation loads
**Steps:**
1. Navigate with valid token and orgId
**Expected:**
- `client.invitations.verifyEmailByToken()` called once automatically
- This is a silent background operation (no UI indicator)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.invitations.getByToken({ token, organizationId })` | TC-01, TC-02, TC-03, TC-05 |
| `client.invitations.verifyEmailByToken({ token, organizationId })` | TC-09 |
| `client.invitations.accept({ token, organizationId })` | TC-02, TC-07, TC-08 |
| `authClient.useSession()` | TC-02, TC-03, TC-04 |

## Edge Cases

### EC-01: Double auto-accept prevention
**Setup:** Component remounts (StrictMode or navigation)
**Expected:** `hasProcessedRef.current` prevents second `acceptMutation.mutate()` call

### EC-02: localStorage write failure (private browsing)
**Setup:** localStorage disabled or quota exceeded
**Expected:** try/catch in `onSuccess` prevents crash; dashboard navigation still proceeds

### EC-03: Token already accepted (server returns error)
**Setup:** Same invitation link used twice
**Expected:** `acceptMutation` error handler shows appropriate message

## Known Gaps
- Full flow requires a real invitation token; hard to test without seeding data
- SignupForm behavior for invitation users (auto-filling email, etc.) not covered here
