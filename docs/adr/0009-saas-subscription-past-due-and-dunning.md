# ADR 0009 — SaaS Subscription Past-Due Behavior and Dunning

Date: 2026-05-13
Status: Accepted

## Context

When a Tenant's SaaS subscription invoice fails, Stripe Billing retries automatically (dunning). Avantej must decide what happens to Tenant access to the application and to the Connect payment path during that window. The decision balances revenue protection, customer experience (end Customers of the Tenant should not suffer for the Tenant's billing issue), and dev simplicity.

## Decision

**Grace period:** 7 days from the moment the subscription transitions to `past_due`.

**App access state machine (enforced by `requireActiveSaaSSub` middleware):**

| Subscription status | Avantej app | Banner |
|---|---|---|
| `active`, `trialing` | full | none |
| `past_due` within 7-day grace | full | "Payment failed — update card" |
| `past_due` past 7-day grace | read-only (GET allowed, all mutations rejected with `SAAS_PAST_DUE_READONLY` error code) | persistent block + customer portal link |
| `unpaid`, `canceled`, `incomplete_expired` | read-only | "Subscription ended — resubscribe to continue" |
| `incomplete` (never paid first invoice) | blocked entirely | "Complete your initial payment" |

**Connect payment path** is intentionally **not gated** on SaaS subscription state. End Customers of the Tenant continue to be able to purchase packages even while the Tenant's SaaS sub is past_due. Rationale: Customers have no visibility into the B2B billing relationship and should not be penalized; Stripe app-fees on those transactions are a partial revenue continuity for Avantej during the dunning window.

**Dunning notifications:** Use Stripe's built-in invoice and dunning emails (configurable templates in Stripe Dashboard). Avantej app surfaces in-app banner driven by `subscriptions.status`. Custom Avantej-branded emails deferred to post-v1.

**Schema additions** to `subscriptions` (control-panel):
- `pastDueAt timestamptz` — set on transition into `past_due`, cleared on cure.
- `gracePeriodEndsAt timestamptz` — `pastDueAt + 7 days`, computed at transition.

Synced via `customer.subscription.updated` and `invoice.payment_failed` webhooks.

**Cure path:** Tenant uses Stripe Billing Customer Portal (`billingPortal.sessions.create`) accessible from the in-app banner. Updating the card triggers Stripe's automatic retry; on success, webhook transitions status back to `active` and clears `pastDueAt`.

## Consequences

Positive:
- End Customers experience no disruption from Tenant billing issues.
- Tenant gets a clear week of grace plus persistent UI prompts before any access loss.
- App-fee revenue continues even during sub dunning — partial revenue floor.
- Dunning emails are free via Stripe; no Avantej email infra needed for v1.
- State machine is small and middleware-driven — easy to test.

Negative:
- A Tenant who is in `past_due` for the full Stripe retry window (~3 weeks) is read-only in Avantej for ~2 weeks while still collecting Customer payments through Connect. Avantej still collects app-fees during this period, but the Tenant could be quietly extracting value from the platform without paying the SaaS sub. Mitigation: read-only access blocks most operational mutations (new memberships, scheduling, etc.), reducing the value of remaining access.
- Read-only mode requires every mutating procedure to be reachable by the middleware — enforcement is centralized in oRPC procedure decorators, not scattered.

## Alternatives considered

- **Hard cut Connect on past_due** — Rejected. End Customers harmed for Tenant's billing fault.
- **Penalty app-fee on past_due** (auto-raise from 2% to 10%) — Rejected for v1; nice idea but adds dynamic-fee complexity to Connect flows and confusing for Customer receipts.
- **3-day or 14-day grace** — 3 days too aggressive (cards-expired-while-on-vacation case); 14 days too lenient relative to Stripe's own dunning timing. 7 days fits industry SaaS norm.
- **Custom Avantej dunning emails** — Deferred to v2 once email infra and templates exist.
