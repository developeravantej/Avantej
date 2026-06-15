# Test Plan: Subscribe / Pricing Page

**Route:** `/subscribe`
**Auth required:** no (supports both authenticated and guest checkout)
**Last round:** 1

## Preconditions
- App running at localhost:3001 and server at localhost:3000
- Stripe configured in dev environment
- Test plans to verify: authenticated user flow, guest flow, success callback, cancel callback

## Test Cases

### TC-01: Page loads — authenticated user
**Trigger:** Navigate to `/subscribe` while logged in
**Steps:**
1. Log in as franchisee@gmail.com / password123
2. Navigate to `/subscribe`
3. Wait for plans to load
**Expected:**
- Page title "Flexible Business Software..."
- Plans grid renders (loading spinner shown then plans appear)
- Each plan card: icon, name, description, price, features list, "Get Started" button
- Most Popular badge on "pro" plan (if present in Stripe)
- No Guest Checkout Dialog shown

### TC-02: Page loads — guest user
**Trigger:** Navigate to `/subscribe` while logged out
**Steps:**
1. Ensure logged out
2. Navigate to `/subscribe`
3. Wait for plans to load
**Expected:**
- Plans render with "Subscribe Now" + Mail icon buttons instead of "Get Started"
- No auth redirect

### TC-03: Plans loading state
**Trigger:** Monitor initial load
**Steps:**
1. Navigate to `/subscribe`
2. Observe before plans arrive
**Expected:**
- Spinner (`Loader2 animate-spin`) shown during load
- "Loading plans..." text visible

### TC-04: Plans error state
**Trigger:** Simulate API error (disconnect server)
**Steps:**
1. Stop server
2. Navigate to `/subscribe`
3. Wait for error
**Expected:**
- `Alert variant="destructive"` shown
- "Failed to Load Plans" heading
- Error message from API visible
- Spinner gone

### TC-05: No plans available state
**Trigger:** API returns empty array
**Steps:**
1. Mock/configure API to return empty plans
**Expected:**
- "No Plans Available" section shown
- "Refresh Page" button visible
- Clicking refresh reloads the page

### TC-06: Authenticated checkout — select plan
**Trigger:** Click plan button while logged in
**Steps:**
1. Log in and navigate to `/subscribe`
2. Click "Get Started" on any plan
**Expected:**
- `createCheckout` mutation fires
- Button shows "Processing..." with spinner
- Other plan buttons disabled (pointer-events-none + opacity-70)
- Stripe checkout URL redirects browser on success

### TC-07: Guest checkout — opens dialog
**Trigger:** Click plan button while logged out
**Steps:**
1. Ensure logged out, navigate to `/subscribe`
2. Click "Subscribe Now" on a plan
**Expected:**
- Guest Checkout Dialog opens
- Fields: "Email Address *", "Full Name *"
- "What happens next?" info box visible
- Cancel and "Continue to Payment" buttons

### TC-08: Guest checkout — form validation
**Trigger:** Submit guest form empty
**Steps:**
1. Open guest dialog
2. Click "Continue to Payment" without filling fields
**Expected:**
- Error: "Email is required" on email field
- Error: "Full name is required" on name field

### TC-09: Guest checkout — invalid email
**Trigger:** Enter invalid email in guest form
**Steps:**
1. Open guest dialog
2. Enter "bademail" in email, fill valid name
3. Click "Continue to Payment"
**Expected:**
- Error: "Please enter a valid email address"

### TC-10: Guest checkout — cancel dialog
**Trigger:** Click Cancel in guest dialog
**Steps:**
1. Open guest dialog
2. Click "Cancel" button
**Expected:**
- Dialog closes
- No navigation

### TC-11: Guest checkout — valid submission
**Trigger:** Fill guest form and submit
**Steps:**
1. Open guest dialog
2. Enter valid email and full name
3. Click "Continue to Payment"
**Expected:**
- `createGuestCheckout` mutation fires
- Dialog shows "Processing..." on button
- On success: dialog closes, browser redirects to Stripe checkout URL

### TC-12: Payment success callback — guest with password setup
**Trigger:** Return from Stripe with session_id; guest who needs password setup
**Steps:**
1. Navigate to `/subscribe?session_id=<test_session_id>`
2. Session metadata has `requires_password_setup: "true"` and `guest_email`
**Expected:**
- "Processing your payment..." spinner shown
- On success: fetches setup token from `/api/v1/auth-setup/get-setup-token/<email>`
- Redirects to `/setup-password?token=<token>`

### TC-13: Payment success callback — requires onboarding
**Trigger:** Return from Stripe with session requiring onboarding
**Steps:**
1. Navigate to `/subscribe?session_id=<session>` where `requires_onboarding: "true"`
**Expected:**
- Processing spinner shown
- Redirects to `/onboarding`

### TC-14: Payment success callback — existing org
**Trigger:** Return from Stripe, user already has org
**Steps:**
1. Navigate to `/subscribe?session_id=<session>` where neither password nor onboarding required
**Expected:**
- Redirects to `/dashboard`

### TC-15: Payment canceled
**Trigger:** Return from Stripe canceled
**Steps:**
1. Navigate to `/subscribe?canceled=true`
**Expected:**
- `Alert variant="destructive"` shown
- Message: "Payment was canceled. Please try again or contact support..."
- Plans still visible

### TC-16: Payment error — process failure
**Trigger:** `processPaymentMutation` fails
**Steps:**
1. Simulate payment processing error (invalid session_id)
**Expected:**
- Error state set: "Failed to process your payment. Please contact support."
- Alert visible on page

### TC-17: Architecture info strip
**Trigger:** Load page, check info strip
**Steps:**
1. Navigate to `/subscribe`
2. Scroll past plans grid
**Expected:**
- 4-column info strip visible: Backend (avantej Core), Frontend (avantej Flow), Extensions (Google Sheets), Architecture (Scalable, Modular)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `apiClient.getGetsubscriptionplans()` | TC-01, TC-03, TC-04, TC-05 |
| `apiClient.postCreatecheckoutsession()` | TC-06 |
| `apiClient.postCreateguestcheckoutsession()` | TC-11 |
| `apiClient.getStripeRetrieveSession()` | TC-12, TC-13, TC-14 |
| `/api/v1/stripe/guest-session/:id` (REST) | TC-12 (guest path) |
| `/api/v1/auth-setup/get-setup-token/:email` (REST) | TC-12 |

## Edge Cases

### EC-01: Session already processed (double-render)
**Setup:** React StrictMode double-invokes effects; `processedSessionRef` guards against double-processing
**Expected:** `processPaymentMutation.mutate()` called only once per session_id

### EC-02: Stripe.js initialization failure
**Setup:** Simulate `getStripe()` returning null
**Expected:** Error thrown: "Failed to initialize Stripe checkout"; caught by `onError` handler

### EC-03: Auth error during authenticated checkout (fallback to guest endpoint)
**Setup:** Authenticated user has expired token
**Expected:** `isAuthError()` returns true, fallback to guest session endpoint attempted

### EC-04: Guest checkout dialog — typing clears errors
**Setup:** Trigger validation errors, then start typing
**Expected:** Field-specific error clears as soon as user types in that field

## Known Gaps
- Full Stripe checkout redirect cannot be tested without live Stripe test keys
- `setup-token` endpoint behavior depends on server-side auth-setup module
- Cannot easily simulate `requires_password_setup` metadata without Stripe test session manipulation
