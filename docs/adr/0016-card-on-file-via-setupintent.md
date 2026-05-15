# ADR 0016 — Card-on-File via SetupIntent + Off-Session Charges

Date: 2026-05-15
Status: Accepted

## Context

The fitness business model relies heavily on recurring revenue (memberships) and post-session adjustments (no-show fees, late cancellations, rebookings). All of these require **charging a customer's card without them being present**.

Stripe terms:
- **On-session charge** — customer is in the checkout flow, can complete 3DS / SCA themselves.
- **Off-session charge** — staff initiates, customer not present; Stripe attempts the charge with the saved payment method; SCA-required cards may return `requires_action`.

For off-session to work, the customer's payment method must have been collected via a SetupIntent with `usage="off_session"`. That SetupIntent records customer consent for future charges.

In Connect Standard architecture, Stripe Customer objects live on the **connected account** (the tenant's acct), not the platform. Each tenant maintains their own customer space. Saved payment methods are scoped to that Customer.

Per ADR-0014 (snapshot pattern), saved PaymentMethods can't be charged from a different acct than the one that issued the SetupIntent.

## Decision

Implement card-on-file via the standard Stripe pattern:

1. **Stripe Customer per tenant client** (`customer-stripe.service.ts → getOrCreateStripeCustomer`):
   - On first save-card or first charge, create a Stripe Customer on the tenant's Connect acct with metadata `{ customerProfileId, organizationId }`.
   - Persist `customer_profiles.stripe_customer_id` + `stripe_connect_account_id_snapshot`.
   - Reuse on subsequent calls (snapshot acct must match current acct, else re-provision — covers a hypothetical Phase 4 branch-acct migration).

2. **Save card** (`payments.createSetupIntent({ organizationId, customerProfileId })`):
   - Resolve or create the Stripe Customer.
   - Create a SetupIntent on the connected acct with `usage="off_session"` and `metadata.customerProfileId`.
   - Return `clientSecret` to the web.
   - Web mounts `<Elements stripeAccount=<acct> options={clientSecret}>` + `<PaymentElement>`, confirms with `stripe.confirmSetup({ redirect: "if_required" })`.
   - On `setup_intent.succeeded` webhook (connect endpoint), persist `customer_profiles.default_payment_method_id = pm_...`.

3. **List saved cards** (`payments.listSavedCards`):
   - Read profile's snapshot acct, call `stripe.paymentMethods.list({ customer, type: "card" }, { stripeAccount: snapshot })`.
   - Return brand/last4/expMonth/expYear + isDefault flag.

4. **Charge saved card** (`payments.chargeSavedCard({ amount, paymentMethodId?, appointmentId? })`):
   - Picks `paymentMethodId` from input OR profile.defaultPaymentMethodId.
   - Picks `stripeAccount` from customer's snapshot (NOT the country resolver — see ADR-0014).
   - Picks fee% from the country resolver IF appointmentId provided (resolves via branch country), else legacy resolver. Fee % is currently tier-only, so the distinction is benign today but documents intent for future country-specific fee policy.
   - Calls `stripe.paymentIntents.create({ customer, payment_method, confirm: true, off_session: true, application_fee_amount, ... }, { stripeAccount: snapshot, idempotencyKey })`.
   - Returns `paymentIntentId, status, amount, currency, applicationFeeAmount`. Status may be `succeeded`, `requires_action`, `requires_payment_method`, etc.

5. **UI** (`SavedCardsSection`):
   - Lists saved cards with brand/last4/exp.
   - "Save card" button → SetupIntent dialog.
   - Per-row "Charge" button → amount + description dialog → chargeSavedCard → toast result.

SCA handling for v1: if `status === "requires_action"`, surface to staff via toast as "Charge needs follow-up: requires_action. PI=pi_..." Staff resolves out-of-band (call customer, ask them to complete 3DS via dashboard or by re-paying). Future: in-app SCA challenge UI.

## Consequences

Positive:
- Membership renewals, no-show fees, deposits all run on the same off-session charge path.
- One-tap rebooking: staff opens customer's saved card list → Charge → done.
- Stripe Customer per tenant scope keeps PCI/PII boundary correct (tenant owns the customer relationship, not Avantej).

Negative:
- 3DS / SCA-required cards return `requires_action` and need manual follow-up in v1. Real-world hit rate is low for MY market but non-zero (especially EU travelers).
- A tenant's Stripe Customer is opaque to other tenants — if the same customer attends two franchises, they save their card twice. Acceptable (and arguably correct — each franchise relationship is independent).
- No card-update flow yet (e.g. expired card). Customer must save a new card; the old PM stays on the Customer. Cleanup needs separate work.

## Alternatives considered

- **Stripe Subscriptions for memberships** — would replace the off-session charge path for recurring revenue with Stripe's native subscription engine. Rejected for v1 because membership pricing in this market often has non-Stripe-friendly patterns (mid-cycle credits, freezes, package conversions). Will revisit when membership model stabilizes.
- **Customer on platform acct (not connected acct)** — would consolidate customers across tenants. Rejected: violates the merchant-of-record boundary (ADR-0001) and creates Stripe's "platform-on-platform" classification problem.
