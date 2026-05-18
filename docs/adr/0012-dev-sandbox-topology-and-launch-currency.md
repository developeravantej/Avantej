# ADR 0012 — Dev Sandbox Topology and v1 Launch Currency

Date: 2026-05-13
Status: Accepted

## Context

Two operational decisions remained: how Stripe sandboxes are partitioned across dev/CI/staging environments, and whether v1 supports multiple currencies. Stripe accounts permit at most five sandboxes (plus the default test-mode sandbox). Multi-currency support adds significant complexity to pricing, settlement, FX handling, and Connect onboarding flows.

## Decision

### Sandboxes

A single Avantej Stripe account holds four named environments:

| Sandbox | Purpose | Key location |
|---|---|---|
| `default-test` (built-in) | Manual dashboard exploration, one-off tests | shared |
| `dev-shared` | All engineers' localhost + Vercel/CF preview deploys | `.env.local`, preview env vars |
| `ci-e2e` | GitHub Actions integration and E2E tests | GH Actions secrets |
| `staging` | Pre-prod mirror | staging infra env vars |

Per-dev sandboxes are not used (5-cap doesn't scale beyond a small team). Test object isolation across devs is achieved via Stripe metadata tagging (`metadata.devId`) where needed. Webhook routing is per-machine via each developer's own `stripe listen` session, but objects live in the shared sandbox.

### Currency

v1 ships USD-only. All Products, Prices, PaymentIntents, and Subscriptions are denominated in USD. Future expansion to additional currencies is a v2 design.

**Schema forwardness:** Every monetary table (`payments`, `payment_intents` if added, `subscriptions`, `platform_payment_ledger`) carries a `currency text not null default 'usd'` column from day one. Amounts are stored as integer minor units (cents). Application-fee math uses integer arithmetic only: `Math.floor(amount * applicationFeeBps / 10000)`.

## Consequences

Positive:
- Sandbox layout fits inside Stripe's 5-cap with room for a scratch sandbox if needed later.
- Shared `dev-shared` lets a single seed script keep every developer's environment uniform.
- USD-only v1 sidesteps FX, multi-settlement, and country-specific Connect onboarding nuances.
- Currency column in schemas means v2 multi-currency is a data migration, not a schema migration.

Negative:
- Shared `dev-shared` means test data accumulates over time; periodic cleanup or metadata filtering is needed.
- USD-only blocks tenants from non-USD-default countries until v2.
- Per-developer webhook secrets (each `stripe listen` issues its own `whsec_`) need a "use your own secret" convention in `.env.local`; misalignment yields verification failures.

## Alternatives considered

- **Per-developer sandbox** — Rejected due to 5-cap and seed-script duplication.
- **Multi-currency in v1** — Rejected for v1 to keep timeline; the schema-forward column allows v2 without schema churn.
- **Single sandbox for dev + CI + staging** — Rejected; CI test runs would pollute developer state and vice versa.
