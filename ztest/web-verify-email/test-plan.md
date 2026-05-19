# Test Plan: Verify Email Page

**Route:** `/verify-email`
**Auth required:** no
**Last round:** 1

## Preconditions
- App running at localhost:3001
- Server running at localhost:3000
- A valid verification token (from signup or email-verify flow)
- oRPC client: `client.auth.verifyEmail({ token })`

## Test Cases

### TC-01: Page loads with valid token — success flow
**Trigger:** Navigate to `/verify-email?token=<valid_token>`
**Steps:**
1. Use a real token from a fresh signup
2. Navigate to `/verify-email?token=<valid_token>&callbackURL=/dashboard`
3. Wait for verification
**Expected:**
- Initial state: Loader2 spinner + "Verifying…" text visible
- On success: green CheckCircle icon + "Email verified. Redirecting…"
- After ~1.2s: navigates to `/dashboard` (callbackURL)

### TC-02: Default callback URL is /login
**Trigger:** Navigate without callbackURL param
**Steps:**
1. Navigate to `/verify-email?token=<valid_token>`
**Expected:**
- On success: navigates to `/login` (default)

### TC-03: Invalid or expired token — error state
**Trigger:** Navigate with bad token
**Steps:**
1. Navigate to `/verify-email?token=invalidtoken123`
**Expected:**
- Initial spinner shown
- Error state: red XCircle icon + "Verification failed" heading
- "Email verification failed. The link may be expired or invalid." message

### TC-04: Missing token
**Trigger:** Navigate without token param
**Steps:**
1. Navigate to `/verify-email` (no token)
2. Or navigate to `/verify-email?token=`
**Expected:**
- Error state immediately: "Missing verification token."

### TC-05: callbackURL security — absolute URLs rejected
**Trigger:** Navigate with external absolute callbackURL
**Steps:**
1. Navigate to `/verify-email?token=valid&callbackURL=https://evil.com`
**Expected:**
- `callbackURL` is not `https://evil.com` — the `validateSearch` function only allows relative paths starting with `/`
- Falls back to `/login`

### TC-06: callbackURL — relative path accepted
**Trigger:** Navigate with valid relative callbackURL
**Steps:**
1. Navigate to `/verify-email?token=valid&callbackURL=/dashboard/customers/view`
**Expected:**
- On success: redirects to `/dashboard/customers/view`

### TC-07: Loading state initial render
**Trigger:** Observe card before API responds
**Steps:**
1. Navigate to `/verify-email?token=valid`
2. Observe before response arrives
**Expected:**
- Card header: "Verify your email" + description
- Body shows spinner + "Verifying…"

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.auth.verifyEmail({ token })` | TC-01, TC-03, TC-04 |

## Edge Cases

### EC-01: Double-mount in React StrictMode
**Setup:** React StrictMode calls useEffect twice in dev
**Expected:** `cancelled` flag prevents double API call / state conflict

### EC-02: callbackURL starting with //
**Setup:** Navigate to `/verify-email?token=t&callbackURL=//evil.com`
**Expected:** Rejected as non-relative path; falls back to `/login`

### EC-03: Slow network — long verification
**Setup:** Throttle network in DevTools
**Expected:** Spinner remains until response arrives; no timeout UI

## Known Gaps
- Cannot easily get a real token without going through signup flow
- No resend verification email button/link on this page
