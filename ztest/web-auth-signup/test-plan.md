# Test Plan: Signup Page

**Route:** `/auth/signup` (file-route `/(auth)/signup`)
**Auth required:** no
**Last round:** 1

## Preconditions
- App running at localhost:3001
- Server running at localhost:3000
- Route delegates to `SignupForm` component at `@/components/forms/signup-form`
- Email delivery configured for verification emails

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/signup`
**Steps:**
1. Open browser, ensure not logged in
2. Navigate to `http://localhost:3001/signup`
**Expected:**
- SignupForm renders centered in max-w-3xl container
- Form fields visible (at minimum: email, password, name)
- Submit button visible
- No console errors

### TC-02: Successful signup
**Trigger:** Register a new unique email
**Steps:**
1. Navigate to `/signup`
2. Fill in valid name, unique email, password meeting requirements
3. Click submit
**Expected:**
- Loading state shown
- On success: either redirected to email verification page or dashboard
- No console errors

### TC-03: Duplicate email registration
**Trigger:** Register with an already-used email
**Steps:**
1. Navigate to `/signup`
2. Enter an email that already has an account (e.g., franchisee@gmail.com)
3. Submit
**Expected:**
- Error message: email already in use or similar

### TC-04: Form validation — empty fields
**Trigger:** Submit empty
**Steps:**
1. Navigate to `/signup`
2. Click submit without filling fields
**Expected:**
- Validation errors on required fields

### TC-05: Form validation — invalid email
**Trigger:** Enter non-email string
**Steps:**
1. Navigate to `/signup`
2. Enter "bademail" as email
3. Submit
**Expected:**
- Email validation error

### TC-06: Form validation — weak password
**Trigger:** Enter short password
**Steps:**
1. Navigate to `/signup`
2. Enter password shorter than minimum (likely 8 chars)
3. Submit
**Expected:**
- Password validation error

### TC-07: Already authenticated redirect
**Trigger:** Visit signup while logged in
**Steps:**
1. Log in first, then navigate to `/signup`
**Expected:**
- Redirected away from signup

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `authClient.signUp.email()` (Better-Auth) | TC-02, TC-03 |

## Edge Cases

### EC-01: Password confirmation mismatch (if confirm password field exists)
**Setup:** Enter mismatched password and confirm-password
**Expected:** Validation error shown before API call

### EC-02: Email with plus sign
**Setup:** Enter "user+test@gmail.com"
**Expected:** Accepted as valid email; not rejected by validation

## Known Gaps
- SignupForm component not read in detail; exact fields and validation schema unknown
- Email verification flow after signup not covered here (covered in web-verify-email test plan)
