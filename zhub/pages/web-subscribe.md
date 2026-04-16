# Subscribe / Subscription Plans

**Route:** `/subscribe`
**File:** `apps/web/src/routes/subscribe.tsx:1`
**Platform:** web
**Auth required:** public (supports both authenticated and guest checkout)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets users browse and purchase a subscription plan, either as an authenticated user or as a guest (no account required).

**Produces:** A plans grid fetched from the backend, each plan showing price, interval, and feature list. Authenticated users click "Get Started"; unauthenticated users click "Subscribe Now" which opens a guest-checkout slide-in sheet.

**On success:**
- Authenticated checkout: redirects to Stripe-hosted checkout URL.
- Guest checkout: collects email + full name, then redirects to Stripe.
- After Stripe returns with `?session_id=…`: processes payment, then:
  - New guest user → fetches password-setup token → navigates to `/setup-password?token=…`
  - Existing user needing org → navigates to `/onboarding`
  - Existing user with org → navigates to `/dashboard`

**On failure / error states:**
- `?canceled=true` query param → shows "Payment was canceled" alert.
- Plan fetch error → destructive `Alert` with error message.
- Checkout creation error → inline `Alert`.
- Guest session retrieval error → inline `Alert`; fallback to `/login`.

---

## 2. How It Works

**Execution flow:**
```
SubscribePage
  → useAuth() — checks isAuthenticated
  → useQuery(["subscription","plans"])
      → GET /api/v1/subscription-plans (via apiClient.getGetsubscriptionplans)
  → handleSelectPlan(priceId)
      → if authenticated: createCheckout mutation
          → POST /api/v1/checkout-session (apiClient.postCreatecheckoutsession)
          → redirect to Stripe URL
      → if guest: open Sheet → handleGuestCheckout
          → POST /api/v1/guest-checkout-session (apiClient.postCreateguestcheckoutsession)
          → redirect to Stripe URL
  → on Stripe return with ?session_id:
      → processPaymentMutation
          → GET /api/v1/stripe/retrieve-session/:id (authenticated)
          → fallback: GET /api/v1/stripe/guest-session/:id (raw fetch, no auth)
      → navigate based on metadata flags
```

**Inputs:**
- `?session_id` (string) — Stripe checkout session ID returned after payment
- `?canceled` ("true") — set by Stripe when user cancels checkout

**State management:** Local `useState` for error, guest form fields, navigation guard ref (`processedSessionRef`).

**Outputs:** Plans grid, loading/error alerts, guest Sheet form, payment-processing spinner.

**Side effects:**
- Redirects browser to Stripe-hosted checkout page (`window.location.href = data.url`).
- After successful payment: navigates to `/setup-password`, `/onboarding`, or `/dashboard`.
- Guest checkout creates a new user account on the backend on payment success.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `GET /api/v1/subscription-plans` — fetch available Stripe plans
- `POST /api/v1/checkout-session` — create authenticated Stripe checkout session
- `POST /api/v1/guest-checkout-session` — create guest Stripe checkout session
- `GET /api/v1/stripe/retrieve-session/:id` — process payment (authenticated)
- `GET /api/v1/stripe/guest-session/:id` — process payment (guest, raw fetch)
- `GET /api/v1/auth-setup/get-setup-token/:email` — get password setup token for guest

**Uses these components:**
- `Card`, `CardHeader`, `CardContent`, `CardFooter` — `@/components/ui/card`
- `Button` — `@/components/ui/button`
- `Alert` — `@/components/ui/alert`
- `Sheet`, `SheetContent` — `@/components/ui/sheet` — guest checkout side panel
- `Input`, `Label` — form fields in guest sheet

**Uses these hooks:**
- `useAuth` — `@/hooks/useAuth` — provides `isAuthenticated`
- `useQuery` — TanStack Query — fetches plans list
- `useMutation` (×3) — processPayment, createCheckout, createGuestCheckout
- `useNavigate` — TanStack Router navigation

**Navigation: who navigates here:**
- `apps/web/src/routes/subscribe.tsx:186` — from itself after successful payment (requires_onboarding path)
- Stripe redirects back with `?session_id` or `?canceled=true`
- Landing page CTAs link to `/login` (not `/subscribe` directly)

**Navigation: where it goes:**
- `/setup-password?token=…` — guest user needs password setup
- `/onboarding` — new authenticated user needs org creation
- `/dashboard` — existing authenticated user
- `/login` — fallback on error

---

## 4. Data Shapes

**DB tables touched:** None directly from frontend (backend handles Stripe + user creation).

**Key types:**
```typescript
type SubscriptionPlan = {
  id: string;           // Stripe Price ID
  name: string;
  price_amount: number; // Amount in currency's smallest unit
  currency: string;
  interval: string;     // "month" | "year"
  interval_count: number;
  description?: string;
  features: string[];
  metadata: Record<string, string>;
};
```

**Guest checkout form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| email | email | required, valid email format | `customer_email` in checkout session |
| fullName | text | required, min 2 chars | `full_name` in checkout session |

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- Double-processing the same `session_id` (guarded by `processedSessionRef` ref but not tested).
- Guest session fallback when auth fails — complex branching path.
- `hasNavigated` state preventing double navigation on StrictMode double-render.

---

## 6. Notes

- Uses `apiClient` from `@/lib/api` (REST client, NOT the oRPC `client` from `@/utils/orpc`). This is the only major public-facing page that uses the legacy REST client.
- Stripe is loaded lazily via `getStripe()` from `@/lib/stripe` to avoid blocking page render.
- The "Popular" badge is shown for any plan whose name includes "pro" (case-insensitive).
- Plans are cached for 5 minutes (`staleTime: 5 * 60 * 1000`) to avoid hammering Stripe on re-renders.
- `processedSessionRef` + `hasNavigated` state together prevent the payment processing effect from running twice under React StrictMode or on re-renders.
