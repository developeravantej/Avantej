# Avantej Core — Domain Context

## Glossary

- **Avantej (Platform)** — The SaaS provider. Owns the single Stripe platform account. Sells SaaS subscriptions to Tenants. Not a merchant of record for customer-facing transactions.
- **Tenant** — A franchise/gym organization that subscribes to Avantej's SaaS. Each Tenant maps to one `organizations` row (control-panel) and one isolated tenant database (Neon branch). Each Tenant is a Stripe Connected Account (Express). Tenant is the **merchant of record** for all customer-facing payments.
- **Customer (End User)** — A gym-goer who buys packages or memberships from a Tenant. Has no Stripe account. Card swiper only.
- **Trainer / Partner** — A coach affiliated with a Tenant who receives a revenue split per session. Has own Express Connected Account (sibling under Avantej platform, logically linked to Tenant via `partner_stripe_accounts.organizationId`).
- **Package Instance** — A purchased fitness package (e.g. 10-session pack). One-time payment. Tracked in tenant DB `package_instances`.
- **Membership** — Recurring subscription a Customer holds with a Tenant (e.g. monthly Gold Membership). Lives as a Stripe Subscription on the Tenant's Connected Account.
- **SaaS Subscription** — Avantej-billed recurring fee Tenant pays Avantej. Stripe Subscription on the platform account. Tiers: basic / professional / enterprise.
- **Application Fee** — Avantej's per-transaction cut taken from Customer→Tenant payments via Stripe's `application_fee_amount` (one-time) or `application_fee_percent` (recurring).

## Charge Model

- Customer → Tenant payments use **Direct charges on Connect**. Tenant is merchant of record. See [ADR-0001](docs/adr/0001-direct-charges-on-connect.md).

## Monetization

- Hybrid model: SaaS subscription (Tenant → Avantej, platform Billing) + application fee on every Customer → Tenant payment. See [ADR-0002](docs/adr/0002-hybrid-monetization-base-sub-plus-app-fee.md).

## Tenant Activation

- Parallel 14-day trial with two independent gates: SaaS subscription required to keep app access; Connect onboarding required to accept Customer payments. See [ADR-0003](docs/adr/0003-parallel-trial-with-independent-saas-and-connect-gates.md).

## v1 Scope

- v1 ships: SaaS sub + Connect onboarding (Tenant) + one-time package purchase + audit ledger mirror + webhook hardening. v2 defers: recurring memberships, trainer split, in-app refund/dispute UI, Stripe Tax. See [ADR-0004](docs/adr/0004-v1-payment-scope.md).

## Stripe Customer Mapping

- `stripe_customers` table per tenant DB maps `(avantej user id) → stripe customer id` on that Tenant's connected account. Walk-ins use guest checkout. See [ADR-0005](docs/adr/0005-stripe-customer-mapping-in-tenant-db.md).

## Webhook Architecture

- Split endpoints for platform vs connect events, each with its own signing secret. Idempotency via `processed_webhook_events` dedupe table plus natural-key uniqueness in business tables. Synchronous handling for v1. See [ADR-0006](docs/adr/0006-webhook-architecture-and-idempotency.md).

## Customer Payment UX

- Stripe PaymentSheet via `@stripe/stripe-react-native` with Direct charges (`stripeAccountId` per PaymentSheet call). Server `payments.createPaymentIntent` returns the client secret + ephemeral key; finalization happens in the `payment_intent.succeeded` webhook, not client return. See [ADR-0007](docs/adr/0007-customer-payment-ux-paymentsheet.md).

## Tenant Connect Onboarding

- Embedded `<ConnectAccountOnboarding>` component on `apps/web` `/dashboard/billing/connect`. Tenants stay on the Avantej domain. v1 = onboarding only; embedded Payments/Payouts/AccountManagement deferred to v2. See [ADR-0008](docs/adr/0008-tenant-connect-onboarding-via-embedded-components.md).

## SaaS Past-Due Behavior

- 7-day grace from `past_due`, then read-only Avantej app access. Connect payments remain available throughout (end Customers not punished for Tenant billing issues). Stripe dunning emails + in-app banner. See [ADR-0009](docs/adr/0009-saas-subscription-past-due-and-dunning.md).

## SaaS Tier Model

- Hybrid tier shape: quantitative resource limits + binary feature flags, defined in `packages/types/src/tiers.ts`. Tier-driven app-fee (3% / 2% / 1.5%). Soft cap on downgrade — existing data preserved, future writes blocked until usage drops or tier increases. See [ADR-0010](docs/adr/0010-saas-tier-shape-hybrid-limits-plus-features.md).

## Reconciliation

- Nightly Cloudflare Cron at 03:00 UTC reconciles last 48 hours of PaymentIntents, Subscriptions, and Connect account statuses. Repairs by replaying webhook handlers with `source = 'reconciler'`. Manual `admin.reconcileNow` for ad-hoc runs. See [ADR-0011](docs/adr/0011-reconciliation-strategy.md).

## Dev Environment

- Four Stripe sandboxes under a single Avantej account: `default-test`, `dev-shared` (engineers + previews), `ci-e2e`, `staging`. v1 launch currency is USD; schemas carry `currency` column from day one. See [ADR-0012](docs/adr/0012-dev-sandbox-topology-and-launch-currency.md).
