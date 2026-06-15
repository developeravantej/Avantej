# ADR 0015 — Package Purchase via Stripe Payment Link

Date: 2026-05-15
Status: Accepted

## Context

Tenants sell multi-session packages (e.g. "10-session PT pack"). The existing POS flow created `package_instances` rows but collected payment manually (cash / card / bank_transfer with a reference number). To enable remote / online payment, we need to integrate Stripe collection.

Three integration shapes were considered:

1. **Stripe Checkout (hosted page)** — full-page Stripe-hosted form. Best UX, simplest integration. Stripe handles cards, wallets, SCA, errors.
2. **Stripe Elements (embedded in our app)** — finer UX control but staff must collect customer's card details in-person.
3. **Payment Link** — Stripe-hosted URL, shareable. Staff sends to customer, customer pays remotely.

Packages can be sold in two contexts:
- **In-person POS sale** — staff at front desk. Card-present (Elements) or cash works fine.
- **Remote sale** — staff calls/messages customer, customer pays from phone.

The product wants ONE flow that covers both. Sending a link covers both: customer can open it in front of staff (in-person) or remotely on their own device.

## Decision

Use **Stripe Payment Link** as the collection mechanism for package purchases. Implementation:

1. `payments.purchasePackage(serviceId, clientId/walkInCustomerId, creditsTotal, totalPrice, validityDays, ...)`:
   - Creates the `package_instances` row in `status="pending"`, `payment_status="pending"`.
   - Creates a Stripe Price (inline product_data with package name) on the tenant's Connect acct.
   - Creates a Stripe Payment Link with `application_fee_amount`, metadata `{ type: "package", packageInstanceId, organizationId }`, and `payment_intent_data.metadata` mirroring so the resulting PaymentIntent carries the same ids.
   - Returns the link URL.

2. UI surfaces the URL with Copy / SMS / WhatsApp share buttons (POS receipt view + customer detail action).

3. Webhook fast path (`payment_intent.succeeded` with `metadata.type === "package"`):
   - Flip `package_instances.payment_status="paid"`, `status="active"`.
   - On `charge.refunded`: `payment_status="refunded"`, `status="cancelled"`.
   - Failed: left in pending so staff can retry.

Metadata propagation: Payment Link metadata sets on the Checkout Session, NOT on the PaymentIntent. We must explicitly pass `payment_intent_data.metadata` so the PI event carries `packageInstanceId` (see early Phase 2 bug where metadata didn't propagate and webhook silently no-op'd — fixed in commit `d529f55`).

## Consequences

Positive:
- One flow for in-person + remote sales. Staff sends a link either way.
- Stripe handles cards, wallets (Apple Pay / Google Pay), local methods (FPX in MY, PromptPay in TH, etc.), SCA, retries.
- Customer can save the card via Link wallet during checkout for future ease.
- No PCI scope — we never see card numbers.

Negative:
- Two-step UX: staff submits sale → server creates row + link → staff copies/sends link. More clicks than a card-present terminal.
- Payment Links are not idempotent — calling `purchasePackage` twice creates two Stripe Payment Links and orphans the first. Documented as a v1 limitation; mitigation is "regenerate link" UI that updates the persisted URL but doesn't clean up orphans on Stripe side.
- The package row exists before payment. If customer never pays, we accumulate `pending` package rows. Cleanup policy: a background sweeper could mark pending packages older than N days as cancelled. Out of scope for v1.

## Alternatives considered

- **Stripe Checkout via redirect** — equivalent for our purposes but requires our app to host the redirect button per package. Payment Link is the same UX with less code.
- **Stripe Elements in-app** — rejected for v1 because it only handles card-present. Remote sales would need a separate flow.
- **Manual reconciliation (record sale, mark paid via reference)** — pre-Phase-3c.1 status quo. Rejected because it shifts payment-collection burden to staff.
