# ADR 0003 — Tenant Activation: Parallel Trial With Two Independent Gates

Date: 2026-05-13
Status: Accepted

## Context

A Tenant must complete three milestones before they can fully use Avantej:
1. Create their organization (already supported).
2. Subscribe to an Avantej SaaS plan (Stripe Billing on platform account).
3. Complete Stripe Connect onboarding (KYC, bank, tax) so Customers can pay them.

The order in which these are required determines signup friction, demoability, and the gating logic in the application.

## Decision

Adopt parallel activation with two independent gates:

- **Org creation** is free and immediate. The Tenant has full access to a sandbox of the application during a 14-day trial.
- **SaaS subscription** must become active before the trial expires. After that, access to the application is blocked. Acceptable states: `active`, `trialing`. Blocking states: `past_due` (after configurable grace), `canceled`, `incomplete_expired`.
- **Connect onboarding** is required only when the Tenant attempts to enable the customer-facing storefront or accept a Customer payment. Internal-facing features (admin, CRM, scheduling, member management) work without Connect.

Two middleware checks enforce the gates independently:
- `requireActiveSaaSSub` — wraps all protected procedures.
- `requireConnectReady` — wraps customer-payment, storefront, and membership-creation procedures only. Reads `organizations.stripeConnectStatus` and the cached `charges_enabled` flag synced via the `account.updated` webhook.

State surfaced on `organizations` (control-panel):
- `subscriptionStatus`, `trialEndsAt`
- `stripeConnectAccountId`, `stripeConnectStatus`, `chargesEnabled`, `payoutsEnabled`

## Consequences

Positive:
- Low signup friction. Tenants can explore and configure the app without facing Stripe KYC immediately.
- Two failure modes are clearly separated in the UI: "subscribe to keep access" vs. "finish Connect to start selling".
- Avantej can sell/demo without forcing a KYC checkpoint.
- Mirrors the Shopify pattern, which tenants in the SMB segment already understand.

Negative:
- Two pieces of state to track, sync, and surface in the UI.
- Risk of tenants exploring for 14 days then churning without paying — accepted cost; mitigated by usage-based engagement nurture (out of scope for the technical decision).
- Stripe restrictions on a Tenant's Connect account do not automatically cancel their SaaS sub; the two states must be reconciled by ops if a Tenant is permanently restricted.

## Alternatives considered

- **Sub-first, Connect-deferred (A)** — Pay before access. Higher commitment friction, rejected for self-serve segment.
- **Connect-first, then Sub (B)** — Forces KYC before any in-app activity. High friction, rejected.
