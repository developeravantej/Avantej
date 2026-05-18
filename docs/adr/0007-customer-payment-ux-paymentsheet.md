# ADR 0007 — Customer Payment UX: Stripe PaymentSheet (RN SDK) with Server-Side Finalization

Date: 2026-05-13
Status: Accepted

## Context

The customer-facing purchase flow currently lives in `apps/native/app/(app)/dashboard/buy-package/pay.tsx` and uses a mock that calls `client.packageInstances.create` directly. We need to replace it with a real Stripe payment flow using Direct charges on the Tenant's connected account.

Three UX options exist for native: in-app PaymentSheet (Stripe RN SDK), hosted Stripe Checkout via external browser, or a fully custom UI built on `<CardField>`.

## Decision

Use **Stripe PaymentSheet** from `@stripe/stripe-react-native` for card collection and payment confirmation.

**Server endpoint** `payments.createPaymentIntent` (oRPC, protected, requires active SaaS sub + Connect ready):
- Resolves tenant connected account and verifies `charges_enabled`.
- Get-or-creates a Stripe Customer on the tenant connected account (per ADR-0005).
- Creates a Stripe ephemeral key for that Customer (scoped to the tenant connected account).
- Creates a PaymentIntent on the tenant connected account with `application_fee_amount` per ADR-0002, `automatic_payment_methods: { enabled: true }`, and metadata `{ avantejUserId, packageId, organizationId }`.
- Accepts a client-supplied UUID idempotency key and passes it to Stripe to prevent double-charges on retry.
- Returns `{ paymentIntentClientSecret, ephemeralKeySecret, customerId, publishableKey, stripeAccount }`.

**Client (`pay.tsx`)**:
- Wraps app root in `<StripeProvider publishableKey={...}>` using the platform publishable key.
- Generates a UUID per checkout attempt (stored in `useBuyPackageState`) for idempotency.
- Calls `initPaymentSheet` with `stripeAccountId` set to the tenant connected account — this enables Direct charge mode on the SDK side.
- Calls `presentPaymentSheet` to confirm payment.
- On success, navigates to `/done` which polls `client.packageInstances.byPaymentIntent({ piId })` until the webhook handler has materialized the row.

**Finalization** happens in the `payment_intent.succeeded` webhook handler, not on client return. The handler creates the `package_instance`, the `payments` ledger row, and (per ADR-0006) mirrors a row into the control-panel `platform_payment_ledger`.

## Consequences

Positive:
- Native UX, no browser context switch, Apple Pay and Google Pay enabled via single config flag.
- Stripe SDK handles 3DS, retries, decline messages, saved payment methods, network errors.
- PCI scope minimized — our code never touches a raw PAN.
- Server idempotency key makes the create-PaymentIntent call safely retryable.
- Webhook-driven finalization is durable across client crashes and network failures.

Negative:
- "Done" page must poll briefly for the webhook to land; perceived latency can be 1–3 seconds. Mitigated by showing a "Processing" state and an email-confirmation fallback if poll times out.
- `<CardField>`-level customization is unavailable; we accept Stripe's PaymentSheet visual defaults with theme overrides only.
- Existing `pay.tsx` client-side `packageInstances.create` logic must be removed; finalization moves entirely to the webhook handler.

## Alternatives considered

- **Stripe Checkout redirect** — Rejected; breaks native flow with an external browser session and weakens brand experience.
- **Fully custom UI with `<CardField>`** — Rejected for v1 due to higher implementation and maintenance cost without a clear UX win for the fitness-app use case.
- **Client-side finalization** — Rejected; client may disconnect between charge success and server callback, leaving paid customers without provisioned packages.
