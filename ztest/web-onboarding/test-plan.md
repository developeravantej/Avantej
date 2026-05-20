# Test Plan: Onboarding Page

**Route:** `/onboarding`
**Auth required:** yes (authenticated route)
**Last round:** 1

## Preconditions
- App running at localhost:3001
- User is logged in (authenticated session)
- User does not yet have an organization set up

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/onboarding` as authenticated user
**Steps:**
1. Log in, navigate to `/onboarding`
2. Wait for load
**Expected:**
- Blue gradient background
- Card with "Welcome to Avantej!" title
- "Let's set up your organization to get started." subtext
- "Organization Name" input field
- Helper text: "Your organization name will be confirmed when you complete your subscription."
- "Proceed to Subscription" button
- "Next, you'll choose a subscription plan to activate your organization." note

### TC-02: Loading state — auth loading
**Trigger:** Observe while auth is loading
**Steps:**
1. Navigate to `/onboarding`
2. Observe before `authLoading` resolves
**Expected:**
- `PageLoader` (full-page spinner) shown centered on screen

### TC-03: Successful form submission — saves name and redirects
**Trigger:** Enter org name and submit
**Steps:**
1. Navigate to `/onboarding`
2. Enter "My Fitness Franchise" in Organization Name
3. Click "Proceed to Subscription"
**Expected:**
- `sessionStorage["pendingOrgName"]` = "My Fitness Franchise"
- Redirect to `/subscribe`
- Button shows spinner + "Redirecting..." text while `isSubmitting`

### TC-04: Form validation — empty name
**Trigger:** Submit with empty organization name
**Steps:**
1. Navigate to `/onboarding`
2. Leave Organization Name blank
3. Click "Proceed to Subscription"
**Expected:**
- Error shown: "Organization name is required"
- No redirect, no sessionStorage write

### TC-05: Form validation — name too long
**Trigger:** Enter 256+ character name
**Steps:**
1. Enter a string of 256 characters
2. Click submit
**Expected:**
- Validation error: "Organization name is too long"

### TC-06: Button disabled with validation errors
**Trigger:** Check button state when form has errors
**Steps:**
1. Submit with empty name to trigger error
2. Observe button state
**Expected:**
- Button is `disabled` when `!!form.formState.errors.name` is true

### TC-07: user_id search param accepted
**Trigger:** Navigate with user_id param
**Steps:**
1. Navigate to `/onboarding?user_id=some-uuid`
**Expected:**
- Page renders normally (param is accepted but not visibly used in UI)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — form saves to sessionStorage and redirects to `/subscribe` | — |
| `useAuth()` (session check) | TC-01, TC-02 |

## Edge Cases

### EC-01: sessionStorage unavailable
**Setup:** Private browsing or storage disabled
**Expected:** `sessionStorage.setItem` may throw; form submission may silently fail or throw — page should not crash

### EC-02: Navigate back from subscribe
**Setup:** User navigates back from `/subscribe` to `/onboarding`
**Expected:** Form resets to empty defaults; previous pendingOrgName in sessionStorage is overwritten on new submit

### EC-03: Organization name with special characters
**Setup:** Enter name "Avantej's Gym & Spa — KL"
**Expected:** Accepted; stored in sessionStorage as-is

## Known Gaps
- `onSuccess` handler in `onSubmit` does nothing (just sets `isSubmitting` state); actual org creation happens in subscribe flow
- Redirect destination after subscribe completion not tested here
