# Test Plan: Setup Password Page

**Route:** `/auth/setup-password` (file-route `/(auth)/setup-password`)
**Auth required:** no (accessed via email link after guest checkout)
**Last round:** 1

## Preconditions
- App running at localhost:3001, server at localhost:3000
- A valid setup token (obtained after guest Stripe checkout)
- Endpoints used: `/api/v1/auth-setup/setup-token-info/:token` and `/api/v1/auth-setup/setup-password`

## Test Cases

### TC-01: Page loads with valid token — validates and shows form
**Trigger:** Navigate to `/setup-password?token=<valid_token>`
**Steps:**
1. Navigate to the page with a valid unexpired token
2. Wait for token validation
**Expected:**
- Loading spinner shown during validation
- Form shown: "Password" and "Confirm Password" fields
- Card title visible
- No redirect

### TC-02: Missing token — redirect to login
**Trigger:** Navigate without token param
**Steps:**
1. Navigate to `/setup-password` (no token)
**Expected:**
- Toast error: "No setup token provided"
- Immediate redirect to `/login`

### TC-03: Expired token — redirect to login
**Trigger:** Navigate with an expired token
**Steps:**
1. Navigate to `/setup-password?token=<expired_token>`
**Expected:**
- Token validation fires (`/api/v1/auth-setup/setup-token-info/<token>`)
- `is_expired: true` returned
- Toast error: "Password setup link has expired"
- Redirect to `/login`

### TC-04: Token already used (already_has_password) — redirect
**Trigger:** Navigate with token for user who already set password
**Steps:**
1. Navigate to `/setup-password?token=<already_used_token>`
**Expected:**
- `already_has_password: true` returned
- Toast info: "Password already set for this account"
- Redirect to `/login`

### TC-05: Invalid token (API error) — redirect
**Trigger:** Navigate with garbage token
**Steps:**
1. Navigate to `/setup-password?token=garbagetoken`
**Expected:**
- API returns non-200 response
- Toast error: "Invalid or expired password setup link"
- Redirect to `/login`

### TC-06: Valid form submission
**Trigger:** Fill password fields and submit
**Steps:**
1. Navigate with valid token (form shown)
2. Enter Password: "SecurePass123!"
3. Enter Confirm Password: "SecurePass123!"
4. Click submit button
**Expected:**
- POST to `/api/v1/auth-setup/setup-password` with token and password
- Loading state on button during submission
- On success: toast success or redirect (navigate to login or dashboard)

### TC-07: Form validation — password too short
**Trigger:** Enter < 8 char password
**Steps:**
1. Enter "short" in both fields
2. Click submit
**Expected:**
- Validation error: "Password must be at least 8 characters"

### TC-08: Form validation — password mismatch
**Trigger:** Enter different passwords
**Steps:**
1. Enter "ValidPass1" in Password
2. Enter "DifferentPass" in Confirm Password
3. Click submit
**Expected:**
- Validation error: "Passwords do not match" on confirmPassword field

### TC-09: Form validation — empty submission
**Trigger:** Click submit with empty fields
**Steps:**
1. Valid token, form shown
2. Click submit without filling fields
**Expected:**
- Validation errors on both Password and Confirm Password

### TC-10: Submit button state during token validation
**Trigger:** Check UI during loading
**Steps:**
1. Navigate to `/setup-password?token=valid`
2. Observe page during `isValidatingToken: true`
**Expected:**
- Spinner/loading indicator shown while token is being validated
- Form fields not yet visible or disabled

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `GET /api/v1/auth-setup/setup-token-info/:token` | TC-01, TC-03, TC-04, TC-05 |
| `POST /api/v1/auth-setup/setup-password` | TC-06 |

## Edge Cases

### EC-01: Network error during token validation
**Setup:** Server down when validating token
**Expected:** Catch block fires, toast "Invalid or expired password setup link", redirect to `/login`

### EC-02: Network error during password submission
**Setup:** Server goes down after form shown
**Expected:** Mutation fails, error shown to user (toast or inline error)

### EC-03: Token info endpoint returns user email/name
**Setup:** Valid token with full user data
**Expected:** `tokenInfo.email` and `tokenInfo.full_name` stored; potentially displayed in UI

## Known Gaps
- Cannot test without real guest checkout session producing a setup token
- Success navigation destination after password setup unknown without reading full component
