# ADR 0013 — Payment Side Effects on payment_intent.succeeded

Date: 2026-05-15
Status: Accepted

## Context

Phase 2 (Direct Charge) flipped `appointments.payment_status: pending → paid` when a `payment_intent.succeeded` webhook landed, but the rest of the appointment workflow stayed untouched. In practice, staff (and customers) expect a paid appointment to also be:

- **Confirmed** — the appointment moves from `pending` to `confirmed` status so it shows up on the staff calendar as an attending booking.
- **Acknowledged** — the customer gets a receipt so they trust the charge.
- **Audited** — the status change is recorded with `actor=system`, `reason=payment_confirmed`.

Without these, paying an appointment leaves it in a half-state and shifts confirmation burden to staff manually.

Three options for wiring side effects:

1. **In the webhook handler inline** — simplest, but couples webhook handler to side-effect implementation.
2. **A separate service called from the webhook** — clean separation, the side-effect service owns the post-payment workflow.
3. **A queue-driven side-effect runner** — fault-tolerant but adds infrastructure (queue, worker, retry policy).

## Decision

Implement post-payment side effects as a **separate service `payment-side-effects.service.ts`** called synchronously from the connect webhook handler after the appointment status flip. Each side effect is independently try/caught with its own logging — an email send failure must not roll back the status transition, and a side-effect throw must never reach the webhook ack path (which would trigger Stripe retry storms).

Side effects in scope (v1):
1. Flip `appointments.status` from `pending` → `confirmed` (guarded WHERE so `confirmed/completed/cancelled/no-show` pass through untouched).
2. Append an `appointment_status_history` row with `changed_by="system"`, `reason="payment_confirmed"`.
3. Send a receipt email to the customer via the existing Resend wrapper. Customer email resolution: members → `auth.user.email`; walk-ins → `walk_in_customers.email`. Skip + log if neither yields an email.

Deferred:
- Commission ledger entry — needs cross-table policy work; separate ADR.
- `sales_orders.payment_status` sync — not all paid appointments have a sales_order (POS concept); orthogonal flow.
- SMS receipts — Resend doesn't ship SMS; would require Twilio or a SMS gateway integration.

## Consequences

Positive:
- Webhook handler stays small. Side-effect logic is unit-testable in isolation by injecting tenantDb/controlPanelDb/email-sender mocks.
- Each side effect's failure is observable (console.error with appointment id + step name) without affecting the others.
- The receipt is sent fast (synchronous from webhook) so the customer sees confirmation within seconds.

Negative:
- A side-effect failure (e.g. Resend outage) is swallowed — the customer gets no email and there's no auto-retry. Future-Phase: enqueue failed side effects for retry.
- Adding new side effects (SMS, commission) increases the handler's wall-clock time. We accept this for v1; if latency grows past a Stripe webhook timeout (~5s), move to a queue.

## Alternatives considered

- **Inline in webhook handler** — rejected for testability and growth (each new side effect would bloat the handler).
- **Queue-driven runner** — rejected for v1 simplicity. Will revisit if (a) side-effect set grows past 5 steps OR (b) latency causes Stripe retries.
