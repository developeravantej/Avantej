# Subscribe Page

**Route:** `/subscribe`
**File:** `apps/web/src/routes/subscribe.tsx`
**Platform:** web
**Auth required:** public (has different flows for authenticated vs. guest users)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Display pricing plans (fetched from backend) and handle checkout. Authenticated users proceed directly to Stripe; guests fill email/name form first. Handles post-payment flow (password setup or onboarding).

**Produces:** 
- Loading state: spinner
- Plans grid: 3-9+ pricing cards (dynamic from API, includes icon, price, features, CTA button)
- Guest checkout sheet: email + full name form with validation
- Error alerts: destructive variant with error messages
- Payment processing state: shows spinner + "Processing your payment..." while session is being verified

**On success:** Redirected to `/onboarding` (if needs setup), `/setup-password?token=X` (if guest), or `/dashboard` (if existing user).
**On failure / error states:** Error alert shown at top. Payment canceled: "Payment was canceled..." error. Failed to fetch plans: "Failed to Load Plans" alert. Checkout creation error: generic error message. Guest form validation errors show inline below fields.

---

## 2. How It Works

**Execution flow:**
1. Component mounts, reads session_id and canceled from URL
2. If session_id present: processPaymentMutation fetches session details from Stripe (authenticated endpoint or guest endpoint fallback)
3. Session response includes metadata with user flags (requires_password_setup, requires_onboarding, user_id, guest_email)
4. Based on flags, redirect: to /setup-password (if guest + password needed), /onboarding (if needs org), /dashboard (default)
5. Plans fetched via useQuery hook - apiClient.getGetsubscriptionplans()
6. User selects plan:
   - If authenticated: createCheckout() - apiClient.postCreatecheckoutsession() - Stripe URL - redirects to Stripe checkout
   - If guest: opens guest checkout sheet, collects email + name - createGuestCheckout() - similar flow
7. Stripe redirects back to /subscribe?session_id=X or /subscribe?canceled=true

**Inputs:** 
- URL search params: session_id (from Stripe), canceled (from Stripe cancel)
- Plan selection: priceId from clicked plan card
- Guest form: email, fullName

**State management:** 
- useAuth() for checking if authenticated
- useQuery for fetching plans (cached 5 min)
- useMutation for createCheckout() and createGuestCheckout()
- Local state: error, isGuestSheetOpen, selectedPriceId, guestForm, guestFormErrors
- Refs: processedSessionRef, hasNavigated to prevent double-processing

**Outputs:** 
- Renders plans grid or loading/error states
- Mutations: POST to create-checkout-session and create-guest-checkout-session
- Navigation: to /setup-password, /onboarding, or /dashboard
- Side effects: window.location.href = stripe_url (redirect to Stripe)

**Side effects:** 
- Plans fetched on mount and cached
- Session processing prevents infinite loops via processedSessionRef + hasNavigated
- Stripe redirect (external)
- localStorage not touched (auth token passed via API call or session)

---

## 3. What Depends On It

**Calls these API endpoints:** 
- GET /api/*/get-subscription-plans (via apiClient.getGetsubscriptionplans()) - fetch available plans
- POST /api/*/create-checkout-session (via apiClient.postCreatecheckoutsession()) - create Stripe session for authenticated user
- POST /api/*/create-guest-checkout-session (via apiClient.postCreateguestcheckoutsession()) - create Stripe session for guest
- GET /api/*/get-stripe-session/:sessionId (via apiClient.getStripeRetrieveSession()) - retrieve Stripe session details after payment
- GET /api/v1/stripe/guest-session/:sessionId (raw fetch fallback) - guest session fallback if auth fails
- GET /api/v1/auth-setup/get-setup-token/{email} (raw fetch) - get password setup token for guest
- Stripe JS library (external, for payment processing)

**Uses these components:** 
- Button, Card (CardHeader, CardTitle, CardDescription, CardContent, CardFooter) - shadcn/ui
- Alert - shadcn/ui
- Input, Label - shadcn/ui
- Dialog (DialogContent, DialogDescription, DialogHeader, DialogTitle) - shadcn/ui (guest checkout uses Dialog, not Sheet — variable name `isGuestSheetOpen` remains for legacy reasons)
- lucide-react icons (Loader2, Check, Star, Zap, Shield, Users, Mail, User)

**Uses these hooks:** 
- useNavigate() - TanStack Router
- Route.useSearch() - TanStack Router
- useQuery() - TanStack React Query
- useMutation() - TanStack React Query
- useAuth() - custom auth hook
- useState, useEffect, useCallback, useRef - React

**Navigation: who navigates here:** 
- / home page - "Get Started" CTA
- Direct URL /subscribe
- Stripe callback with session_id param

**Navigation: where it goes:** 
- /setup-password?token=X - if guest checkout + password setup required
- /onboarding - if new org needs to be created
- /dashboard - if existing user or after setup complete

---

## 4. Data Shapes

**DB tables touched:** 
- Plans table (backend) - read to fetch subscription options
- Stripe sessions (backend cache/DB) - created during checkout
- Users table - written if guest signup occurs
- Organizations table - written if new org created during onboarding

**Key types / Zod schemas:** 
- SubscriptionPlan (interface): { id, name, price_amount, currency, interval, interval_count, description, features: string[], metadata }
- CreateCheckoutSessionInput: { price_id, success_url, cancel_url, metadata }
- GuestForm: { email (valid), fullName (min 2) }
- Stripe Session Response: { url, session_id, metadata: { requires_password_setup, requires_onboarding, user_id, guest_email } }

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- Edge case: session_id changes rapidly (processedSessionRef may prevent reprocessing)
- Double-submit: user clicks plan twice before request completes
- Guest checkout form: invalid email characters, unicode email validation edge cases
- Network failure during session retrieval: fetch to guest-session endpoint has no retry
- Concurrent mutations: user opens guest sheet then navigates to another plan
- Plan features array may be empty or very large - UI doesn't handle wrapping
- Popular plan detection (includes "pro") is fragile - plan name changes break styling
- Stripe initialization failure (getStripe() returns null) - minimal error handling

---

## 6. Notes

- Fetches plans dynamically (unlike home page which hardcodes pricing) - inconsistent pricing source
- Uses oRPC client for most API calls, but falls back to raw fetch() for guest-session endpoint - inconsistent pattern
- Token validation for guest password setup happens inside mutation success callback, not in effect hook
- Error detection for 401/403 auth errors is string-based - fragile
- isCreatingCheckout and isCreatingGuestCheckout are separate states but both disable same buttons
- Popular plan badge uses hardcoded "pro" check - should use metadata or explicit flag instead
- Processing state prevents all plan cards from being interacted with while waiting for session
- No retry logic if Stripe session retrieval fails - user must reload to retry
- **2026-05-12 cleanup (commit `25f6d75b`):** Removed `console.*` calls, tightened error-handling types (`isAuthError` helper extracted), and switched guest checkout from `Sheet` to `Dialog`. State variable `isGuestSheetOpen` was NOT renamed.

