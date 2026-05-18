# ADR 0001 — Direct Charges on Connect for Customer→Tenant Payments

Date: 2026-05-13
Status: Accepted

## Context

Avantej Core is a multi-tenant SaaS for fitness franchises. There are two payment domains:
- **Layer 1** — Tenant pays Avantej for SaaS access (Stripe Billing, platform account).
- **Layer 2** — Customer pays Tenant for fitness packages and memberships (Stripe Connect).

For Layer 2, Stripe Connect offers three charge models: Direct, Destination, and Separate-charges-with-transfers. The choice determines merchant-of-record, dispute handling, refund authority, statement descriptor, and tax obligations.

The product context: each Tenant operates an independently-branded gym. Customers sign contracts and form a service relationship with the Tenant, not with Avantej. Tenants are expected to handle their own customer support, refunds, and disputes.

## Decision

Use **Direct charges** on the Tenant's Connected Account for all Customer→Tenant transactions (one-time packages and recurring memberships).

Avantej collects revenue via `application_fee_amount` (one-time PaymentIntents) and `application_fee_percent` (recurring Subscriptions on Connect).

## Consequences

Positive:
- Statement descriptor matches the Tenant's brand → fewer "I don't recognize this charge" disputes.
- Tenant handles disputes, refunds, and customer support — Avantej does not get pulled into per-customer issues.
- Sales tax / GST liability stays with the Tenant (correct legally — they sell the service).
- Avantej remains a software platform in Stripe's classification, not a payment aggregator → lighter Connect platform review.
- Refund/dispute logic in Avantej's app is read-only for those flows — simpler implementation.

Negative:
- Avantej cannot enforce uniform refund policies across Tenants from a Stripe API standpoint (must be policy/contract, not technical control).
- Per-transaction visibility comes from webhooks, not direct charge ownership — requires a control-panel ledger mirror table for cross-tenant audit.
- Tenants must complete Express onboarding (KYC, bank, tax) before they can transact — adds friction to Tenant activation.
- If a Tenant's Connected Account is restricted by Stripe, their customer payments halt; Avantej must surface that state and gate the Tenant's app.

## Alternatives considered

- **Destination charges** — Avantej as merchant of record. Rejected because tax/dispute burden falls on Avantej for transactions where Avantej has no operational relationship with the Customer.
- **Separate charges + transfers** — Avantej charges, then transfers to Tenant. Rejected for same reason as Destination, plus higher orchestration complexity.
