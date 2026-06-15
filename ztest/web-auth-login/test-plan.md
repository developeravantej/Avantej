# Test Plan: Login Page

**Route:** `/auth/login` (file-route `/(auth)/login`)
**Auth required:** no
**Last round:** 1

## Preconditions
- App running at localhost:3001
- Server running at localhost:3000
- Test credentials: franchisee@gmail.com / password123, developer.avantej@gmail.com / password1234
- Route delegates to `LoginForm` component at `@/components/forms/login-form`

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/login`
**Steps:**
1. Open browser, ensure not logged in
2. Navigate to `http://localhost:3001/login`
**Expected:**
- Login form renders centered on muted background
- Email and password fields visible
- Submit button visible
- No console errors

### TC-02: Successful login — tenant user
**Trigger:** Login with valid tenant credentials
**Steps:**
1. Navigate to `/login`
2. Enter email: franchisee@gmail.com, password: password123
3. Click submit
**Expected:**
- Loading state shown on button
- On success: redirected to `/dashboard` (or `/onboarding` if no org)
- Session cookie set

### TC-03: Successful login — with invitation params forwarded
**Trigger:** Login via invitation link
**Steps:**
1. Navigate to `/login?invitationToken=abc&orgId=xyz`
2. Log in with valid credentials
**Expected:**
- After successful auth, navigates to `/accept-invitation?token=abc&orgId=xyz` (or equivalent invitation flow)

### TC-04: Login failure — wrong password
**Trigger:** Enter wrong password
**Steps:**
1. Navigate to `/login`
2. Enter franchisee@gmail.com with wrong password
3. Click submit
**Expected:**
- Error message shown (e.g., "Invalid email or password")
- User stays on login page

### TC-05: Login failure — unknown email
**Trigger:** Enter non-existent email
**Steps:**
1. Navigate to `/login`
2. Enter nonexistent@example.com with any password
3. Click submit
**Expected:**
- Error message shown
- User stays on login page

### TC-06: Form validation — empty fields
**Trigger:** Submit empty form
**Steps:**
1. Navigate to `/login`
2. Click submit without filling fields
**Expected:**
- Validation errors shown on both fields
- No API call made

### TC-07: Form validation — invalid email format
**Trigger:** Enter non-email string
**Steps:**
1. Navigate to `/login`
2. Enter "notanemail" in email field
3. Click submit
**Expected:**
- Email validation error shown

### TC-08: Password visibility toggle (if present in LoginForm)
**Trigger:** Click show/hide password button
**Steps:**
1. Navigate to `/login`
2. If password toggle exists, click it
**Expected:**
- Password field type toggles between `password` and `text`

### TC-09: Already authenticated redirect
**Trigger:** Navigate to login while already logged in
**Steps:**
1. Log in successfully
2. Navigate to `/login` again
**Expected:**
- Redirected away from login (to dashboard or home)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `authClient.signIn.email()` (Better-Auth) | TC-02, TC-04, TC-05 |

## Edge Cases

### EC-01: Case-insensitive email
**Setup:** Enter "FRANCHISEE@GMAIL.COM"
**Expected:** Login succeeds or matches email case-insensitively

### EC-02: Trailing whitespace in email
**Setup:** Enter "franchisee@gmail.com " (trailing space)
**Expected:** Form trims or rejects; no silent failure

### EC-03: Session cookie behavior on HTTP localhost
**Setup:** Dev environment on HTTP
**Expected:** Cookie uses `sameSite: "lax"` and `secure: false` (per memory fix); session persists

## Known Gaps
- LoginForm component not read in detail; exact validation schema unknown
- Social login options (if any) not covered
- "Remember me" functionality not covered if present
