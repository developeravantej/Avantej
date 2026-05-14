# Plan A — Completion Notes (2026-05-14)

## Shipped

| Task | Subject | Final commit |
|---|---|---|
| 1 | Tier configuration module (`packages/types/src/tiers.ts`) | `d1a626e` |
| 2 | Subscriptions table extended (price, fee, currency, past-due, period, cancel, canceled) | `9cdc8b4` |
| 3 | Organizations: nullable subscriptionId, trialEndsAt, Connect-state cols | `407421d` |
| 4 | `processed_webhook_events` dedupe table | `36d371b` |
| 5 | `platform_payment_ledger` audit table (skeleton; writes land in Plan D) | `33203c6` |
| 6 | Stripe lib refactor (dual webhook secret, `getStripeClient`, `verifyWebhookSignature` async via `constructEventAsync`) | `fb5574a` |
| 7 | Webhook dedupe service (`claimWebhookEvent` / `markEventProcessed` / `markEventFailed`, non-silent) | `06af4c3` |
| 8 | SaaS subscription lifecycle service (`upsertSubscriptionFromStripe`, `markPastDue`, `markActive`) | `8c11913` |
| 9 | Split webhook routes (`/webhooks/stripe/platform`, `/webhooks/stripe/connect`) | `53a042a` |
| 10 | Stripe Products+Prices seed script (idempotent via `products.list`) | `ee88b39` |
| 11 | Stripe CLI listen wrapper + Makefile | `c5d5b31` |
| 12 | `subscriptions` oRPC router (`createCheckoutSession` / `getStatus` / `billingPortal`) | `425dae9` |
| 13 | `requireActiveSaaSSub` middleware + pure `evaluateAccess` helper | `c570260` |
| 14 | Web `/subscribe` wired to real Stripe.js + new oRPC procedure | `d03dcf4` |
| 15 | Org↔sub linking via `metadata.organizationId` + these notes | `0a90882` |

Plus docs commit `7c77b0e` (CONTEXT.md + 12 ADRs + Plan A spec).

## Pre-existing drift (NOT touched by Plan A; tracked for separate cleanup)

1. **Missing snapshot files** `packages/db/src/migrations/control-panel/meta/0012_snapshot.json` through `0018_snapshot.json`. `bun db:generate:control-panel` is currently unusable — it re-emits drift fixes on every run. Plan A worked around by hand-crafting all migrations (0013-0018).
2. **Orphan SQL** `0010_cp_critical.sql` — exists in migrations dir, NOT in `meta/_journal.json`. References `admin_session_actions` table that consequently was never created in the DB.
3. **`admin_session_actions` schema** exists at `packages/db/src/schema/control-panel/admin-session-actions.ts` but the DB has no such table. No live code currently queries the schema — zero runtime risk, but drift remains.
4. **Shared Neon DB across worktrees** — multiple worktrees write to the same control-panel DATABASE_URL. Drizzle journal-hash mismatches required transient `when` bumps in Tasks 2-5; per-worktree DB branches are an infra fix.

## Deferred follow-ups by Plan

### Plan B (Connect onboarding, ADR-0008)

Before attaching `requireActiveSaaSSub` middleware to any procedure:
- **C1**: Switch from singleton `controlPanelDb` to request-scoped (`getControlPanelDb(c)`) DB access in the middleware.
- **I2**: Declare typed `SAAS_BLOCKED` / `SAAS_PAST_DUE_READONLY` error map at the `o` builder level; remove `as never` casts.

### Plan C (Customer payment via PaymentSheet)

When wiring Connect webhook handlers in `webhooks.routes.ts:/stripe/connect`:
- Reconsider whether to keep the extracted route helper (Task 9 code review recommended) once both routes have real dispatch.

### Plan D (Audit ledger writes + reconciliation cron, ADR-0011)

- **Phase 6-lite writes**: When wiring webhook handlers to write `platform_payment_ledger`, decide:
  - `event_kind` CHECK constraint (Postgres) or Zod enum gate at the writer.
  - FK from `platform_payment_ledger.stripe_event_id` → `processed_webhook_events.event_id` so both rows live or die together.
  - Same-transaction guarantee for dedupe row + ledger row.
- **Legacy-seed reconciliation**: 12 rows in `subscriptions` carry sentinel `stripe_price_id='price_legacy_seed'` and `application_fee_bps=0`. Reconcile cron should fetch real Stripe state and overwrite, OR an admin tool exposes a manual repair button.
- **`processed_webhook_events.last_attempt_at`**: add column for reconciler observability (currently `received_at` is only set on first INSERT).
- **TTL cleanup**: scheduled DELETE on rows older than ~90 days with `processed_at IS NOT NULL`.
- **`requireActiveSaaSSub` middleware Plan D items**:
  - **I1**: replace write-verb-prefix heuristic with explicit oRPC mutation-tag detection.
  - **I3**: explicit `paused` status case (instead of default fallthrough).
  - **I4**: decide policy for `trialing` + null `trialEndsAt` (data integrity edge).
- **Reconciliation cron** (ADR-0011): nightly Cloudflare Cron + admin `reconcileNow` procedure.

### Codebase-wide cleanup (any plan)

- **`getEnvVar` duplicated 4 places** (`stripe.ts`, `db.ts`, `saas-subscription.service.ts`, `subscriptions.ts` router). Extract to `apps/server/src/lib/env.ts` and have all four import it.
- **`getHandler<T>(proc)` test helper** duplicated in `subscriptions.integration.test.ts`. Hoist to `apps/server/src/tests/helpers/orpc.ts` when next router-test file appears.
- **`webAppUrl` fallback** silently returns `http://localhost:3001` in prod; log warn when env var absent.
- **Context-type cleanup**: `(context as { organizationId?: string })` repeated three times in the router. The oRPC `Context` type should expose `organizationId`.

## Open product decisions

- Configure Stripe sandbox secrets (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_PRICE_*`) — operator step, separate from Plan A.
- Run `bun stripe:seed` against the `dev-shared` sandbox to populate Products+Prices.
- Tenant trial duration: trial column is on the org schema (no default — caller responsibility to set at org creation). The signup flow has not been adjusted to set `trialEndsAt = now() + 14 days` — this is a separate task before any new tenant signup.

## How to manually smoke-test Plan A end-to-end

1. **One-time operator steps** (see ADR-0012):
   - Create Stripe sandbox (`dev-shared`).
   - Copy secrets into `apps/server/.env.local` and `apps/web/.env.local`.
   - From `apps/server`: `STRIPE_SECRET_KEY=sk_test_... bun stripe:seed` → paste the three `STRIPE_PRICE_*` lines into `.env.local`.

2. **Local dev terminals**:
   - T1: `bun dev` (server :3000, web :3001).
   - T2: `cd apps/server && make stripe-listen-platform` → paste `whsec_…` into `.env.local` as `STRIPE_PLATFORM_WEBHOOK_SECRET`, restart server.
   - T3: `cd apps/server && make stripe-listen-connect` → paste `whsec_…` as `STRIPE_CONNECT_WEBHOOK_SECRET`, restart server.

3. **Manual flow** (an org must already exist with `trialEndsAt` set):
   - Sign in to web app as a tenant admin.
   - Navigate to `/subscribe`.
   - Click a plan → redirect to Stripe-hosted Checkout.
   - Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
   - Stripe redirects back; webhooks (T2) print `customer.subscription.created → 200 OK` and `invoice.paid → 200 OK`.
   - DB check: `subscriptions` row exists with `tier='professional'`, `applicationFeeBps=200`, `status='active'`. `organizations.subscriptionId` points at it.

4. **Simulate past-due**:
   - `stripe trigger invoice.payment_failed` (T2 forwards) → DB shows `status='past_due'`, `pastDueAt`/`gracePeriodEndsAt` set.
   - `stripe trigger invoice.paid` → DB clears past_due fields back to `active`.
