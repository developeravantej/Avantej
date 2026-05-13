# ADR 0008 — Tenant Connect Onboarding via Embedded Components on Web

Date: 2026-05-13
Status: Accepted

## Context

Tenants must complete Stripe Connect Express onboarding (KYC, bank account, tax info) before they can accept Customer payments. Tenant administration happens primarily on the web app (`apps/web`); the native app is end-Customer-facing.

Stripe offers three onboarding UX options: hosted account links (redirect to Stripe-hosted form), embedded Connect components (inline React components rendered inside the platform's own UI), or fully custom UI built directly on the Accounts API. Embedded components went GA in 2024 for web and have account-onboarding GA on React Native, with other components in preview.

## Decision

Use **embedded `<ConnectAccountOnboarding>` component on the web app** for Tenant onboarding in v1.

Server endpoints (oRPC):
- `connect.getOrCreateAccount` — first call creates an Express account via `stripe.accounts.create({ type: "express", country, email, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } })`, stores `stripeConnectAccountId` on the `organizations` row. Idempotent.
- `connect.createAccountSession` — returns a `client_secret` from `stripe.accountSessions.create({ account, components: { account_onboarding: { enabled: true } } })` for mounting the embedded onboarding component.
- `connect.dashboardLink` — fallback that returns a Stripe Express login link for cases not covered by embedded components.

Web route `/dashboard/billing/connect` renders `<ConnectAccountOnboarding>` inside the platform-themed `<ConnectComponentsProvider>`. Tenants never leave the Avantej domain during onboarding.

`organizations` (control-panel) gains columns synced from Stripe via the `account.updated` webhook:
- `stripeConnectAccountId text unique`
- `stripeConnectStatus text default 'not_started'` — `'not_started' | 'in_progress' | 'active' | 'restricted' | 'rejected'`
- `chargesEnabled boolean default false`
- `payoutsEnabled boolean default false`
- `detailsSubmitted boolean default false`
- `connectAccountUpdatedAt timestamptz`

v1 scope is onboarding only. Embedded Payments, Payouts, and AccountManagement components are deferred to v2; tenants who need those flows in v1 use the `connect.dashboardLink` fallback to open Stripe's Express dashboard.

## Consequences

Positive:
- Tenants stay on the Avantej domain throughout onboarding — better brand trust and lower drop-off than a Stripe-hosted redirect.
- Stripe maintains the form schema, KYC field requirements, document upload UI, and regulatory localization — no Avantej work on Stripe's internal compliance changes.
- Same component handles resume-after-abandonment automatically; no server orchestration of partial state needed.
- Path to v2 is incremental: drop in `<ConnectPayments>`, `<ConnectPayouts>` later without changing the server-side account model.

Negative:
- Web-only in v1. Tenants who admin the business from native must switch to a desktop browser for onboarding. Acceptable: the tenant admin workflow is desktop-dominant.
- One extra component library (`@stripe/connect-js`, `@stripe/react-connect-js`) in the web bundle.
- Embedded components require an active `STRIPE_SECRET_KEY` for the platform; ensure key rotation tooling handles this.

## Alternatives considered

- **Hosted account link redirect** — Rejected. Breaks brand presence and creates a redirect round-trip that increases drop-off.
- **Custom UI on Accounts API** — Rejected. High maintenance cost; Stripe owns the regulatory surface and changes it without notice.
