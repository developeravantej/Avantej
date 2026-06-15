# ADR 0002 — Hybrid Monetization: SaaS Base Subscription + Per-Transaction Application Fee

Date: 2026-05-13
Status: Accepted

## Context

Avantej must monetize the platform. Two revenue mechanisms are available:
- **SaaS subscription** (Stripe Billing on platform account): Tenant pays Avantej a recurring fee.
- **Application fee** (Stripe Connect): Avantej skims a configurable amount from each Customer→Tenant transaction.

Options considered: sub-only (A), per-txn-only (B), hybrid base + per-txn (C), tiered with included volume + overage (D). See pricing scenario analysis in Q2 grill.

## Decision

Use **hybrid (Model C)**: every Tenant pays a recurring SaaS subscription **and** Avantej collects an application fee on every Customer→Tenant payment.

Initial parameters (subject to product/marketing tuning):
- SaaS tiers: Basic $49/mo, Professional $149/mo, Enterprise $499/mo.
- Application fee: 2% on one-time package PaymentIntents (`application_fee_amount`).
- Application fee: 1% on recurring membership Subscriptions on Connect (`application_fee_percent`).

Both rates are configurable per Tenant (column on `organizations` in control-panel DB, defaults set above) so enterprise deals can negotiate.

## Consequences

Positive:
- Revenue floor (sub) + upside (app fee).
- Aligned incentives — Avantej earns more as Tenants grow.
- Industry-standard shape (Shopify, Toast, Mindbody) — tenants understand it.
- Stripe handles both natively; no metering infra needed.
- Per-tenant rate override gives sales flexibility for enterprise contracts.

Negative:
- Pricing page must explain two charges.
- Two billing relationships per Tenant — but app fee is invisible (deducted from connected acct balance before payout), so Tenant only sees the SaaS invoice explicitly.
- Tenant churn from app fee = lost SaaS sub too — slightly higher stakes per customer.

## Alternatives considered

- **Sub-only (A)** — Simple but leaves money on table from high-volume Tenants. Rejected.
- **Per-txn only (B)** — No revenue floor; volatile. Rejected.
- **Tiered with included volume + overage (D)** — More complex to meter and invoice; defer to v2 if pricing experiments demand it.
