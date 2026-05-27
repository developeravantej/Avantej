# D — SaaS Subscription Installments + Stripe Reconciliation Audit

Scope: `apps/server/src/services/saas-subscription.service.ts` and its interaction with the platform webhook handler (`apps/server/src/routes/webhooks.routes.ts`), the nightly reconciler (`apps/server/src/services/reconciler.service.ts`), and the tenant middleware that enforces SaaS access (`apps/server/src/middleware/orpc-tenant.middleware.ts`).

## Public Functions

| Function | Purpose | Called by |
|---|---|---|
| `computeTierFromPriceId(priceId)` — `saas-subscription.service.ts:46` | Maps Stripe `price_xxx` to tier (`basic`/`professional`/`enterprise`) via `STRIPE_PRICE_*` env. Falls back to `"basic"` on unknown. | `upsertSubscriptionFromStripe` (internal) + tests |
| `upsertSubscriptionFromStripe(sub, db?)` — `saas-subscription.service.ts:75` | Insert-or-update local `subscriptions` row from a Stripe Subscription, recomputing tier/limits/period; links `organizations.subscriptionId` when `metadata.organizationId` is present. | Platform webhook `customer.subscription.{created,updated,deleted}` (`webhooks.routes.ts:146-152`) |
| `markPastDue(stripeSubscriptionId, db?)` — `saas-subscription.service.ts:151` | Sets `status="past_due"`, `pastDueAt=now`, `gracePeriodEndsAt=now+7d` on the local row. | Platform webhook `invoice.payment_failed` (`webhooks.routes.ts:153-163`) |
| `markActive(stripeSubscriptionId, db?)` — `saas-subscription.service.ts:173` | Sets `status="active"`, clears `pastDueAt` / `gracePeriodEndsAt`. | Platform webhook `invoice.paid` (`webhooks.routes.ts:164-172`) |

No exported helpers are ORPHAN. Note: the cron-named "Stripe reconciliation" at `0 2 * * *` does NOT call this service — it calls `runReconciliation` (`reconciler.service.ts:68`) which reconciles tenant-side `platform_payment_ledger` vs Stripe Connect charges/refunds/application_fees. SaaS-subscription state is NOT reconciled by any cron — it is webhook-driven only.

## Gaps

### P1 — Lifecycle does not flip `organizations.paymentStatus`; middleware enforcement is dead-code for the SaaS flow
- **Where:** `saas-subscription.service.ts:151` (`markPastDue`), `saas-subscription.service.ts:173` (`markActive`), and the cancellation branch implicit in `upsertSubscriptionFromStripe` (`:75`) on `customer.subscription.deleted`.
- **Symptom:** `orpc-tenant.middleware.ts:149-160` blocks writes only when `organizations.paymentStatus IN ('suspended','cancelled')`. The SaaS lifecycle service writes `subscriptions.status` exclusively (`:158, :179`) and never updates `organizations.paymentStatus`. A Stripe `customer.subscription.deleted` flows into `upsertSubscriptionFromStripe` which mirrors `sub.status` ("canceled") into `subscriptions.status` but leaves `organizations.paymentStatus = "active"`, so the tenant continues writing as if subscribed. Same problem for `invoice.payment_failed` → past_due read-only mode (project doc claims `SAAS_PAST_DUE_READONLY` exists but no code surface enforces it — there is no past_due branch in `orpc-tenant.middleware.ts`).
- **Status:** STUB/BROKEN
- **Testable:** false (no admin UI surface flips paymentStatus from the SaaS lifecycle; verifying requires direct DB inspection after a simulated Stripe webhook).
- **Persistence:** would need write to `organizations.paymentStatus` from `markPastDue` / `markActive` / `upsertSubscriptionFromStripe` (deleted/canceled branch).

### P1 — Platform webhook idempotency relies on a single dedup row with a non-atomic processed-marker
- **Where:** `webhooks.routes.ts:131-142` (`claimWebhookEvent` + `markEventProcessed`), service: `webhook-dedupe.service.ts:24`.
- **Symptom:** Event-ID dedup via `processed_webhook_events.event_id` is present, but the lifecycle work in `upsertSubscriptionFromStripe` / `markPastDue` / `markActive` is NOT wrapped in the same transaction as `markEventProcessed` (`webhooks.routes.ts:197`). A crash between the `upsert` and `markEventProcessed` leaves the local row mutated but the event NOT marked processed — Stripe retries, the second pass mutates again. Idempotent on the schema level (idempotent UPSERT / set-by-id), but a `markActive` after `markPastDue` ordering inversion (Stripe sometimes redelivers older events) WILL clobber a newer "past_due" with stale "active". No event-created-at guard in `markActive` / `markPastDue`.
- **Status:** PARTIAL
- **Testable:** false (requires forging Stripe webhook signatures or harnessing the platform webhook).
- **Persistence:** would need `lastEventAt` / `lastEventCreatedAt` column on `subscriptions` and ordering check in `markActive` / `markPastDue`.

### P1 — No audit trail on lifecycle transitions
- **Where:** `saas-subscription.service.ts:151-192` and `:75-149`.
- **Symptom:** Past-due / active / cancellation transitions write `status` directly, no row written to any audit-log table. The webhook handler logs to `platform_payment_ledger` only for `invoice.paid` (`webhooks.routes.ts:174-189`), not for `invoice.payment_failed`, `subscription.deleted`, `subscription.updated` (tier change), or trial expiry. No record of WHO/WHEN/WHY a tenant moved to past_due.
- **Status:** MISSING
- **Testable:** false (no UI surface; would need DB query against an audit table that does not exist for these events).
- **Persistence:** new audit table or extend `platform_payment_ledger` event-kind set (`saas_subscription_past_due`, `saas_subscription_active`, `saas_subscription_canceled`, `saas_subscription_updated`).

### P1 — Past-due grace window is a hard-coded constant, not configurable
- **Where:** `saas-subscription.service.ts:28` `const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;`
- **Symptom:** No per-tier or per-tenant override. ADR-0009 cited in the file header (`:7`) bakes 7 days in. No reading from env, no override per tier (`TIER_LIMITS` does not expose it). No cron job sweeps subscriptions whose `gracePeriodEndsAt < now` to promote them to `suspended` — grace expiry is silent and never enforced.
- **Status:** STUB
- **Testable:** false (no UI exposes the grace window).
- **Persistence:** would require an env var (`SAAS_GRACE_PERIOD_DAYS`) and a sweeper cron that flips `subscriptions.status` past-due→canceled+`organizations.paymentStatus`=suspended when `gracePeriodEndsAt < now`.

### P2 — Cancellation path silently misses `paymentStatus="cancelled"` write
- **Where:** `webhooks.routes.ts:146-152` (`customer.subscription.deleted` falls into `upsertSubscriptionFromStripe`).
- **Symptom:** On `customer.subscription.deleted`, `upsertSubscriptionFromStripe` (`saas-subscription.service.ts:75`) only mirrors `sub.status` (`"canceled"`) into the row. There is no branch that updates `organizations.paymentStatus` to `"cancelled"`, which is the value `orpc-tenant.middleware.ts:151` actually checks. So a canceled Stripe subscription does not produce a tenant lockout via the middleware.
- **Status:** STUB
- **Testable:** false
- **Persistence:** `organizations.paymentStatus` write coupled with `subscriptions.status="canceled"` upsert.

### P2 — Unknown priceId silently falls back to "basic"
- **Where:** `saas-subscription.service.ts:57-63`.
- **Symptom:** Misconfigured / forgotten `STRIPE_PRICE_*` env vars or a new tier added in Stripe but not in the env will silently downgrade a tenant to `basic` (and to `basic`'s `applicationFeeBps=300`) on the next `subscription.updated` event. Console warn only — no telemetry, no DLQ, no admin alert. Tenant-facing impact: tier limits silently shrink mid-cycle.
- **Status:** PARTIAL
- **Testable:** false (no UI; would require triggering an `customer.subscription.updated` with a foreign priceId and inspecting DB).
- **Persistence:** new column `tier_resolution_status` or DLQ row to `platform_dispute_queue`-like table.

### P2 — Installment / partial-month / proration not implemented in lifecycle layer
- **Where:** entire `saas-subscription.service.ts`.
- **Symptom:** "Installment handling for subscription billing — partial month, proration, plan change mid-cycle." The service mirrors `current_period_start/end` from Stripe (`:96-97`) and the latest priceId, but emits NO local artifact for proration credits, mid-cycle plan changes, or partial-month adjustments. If Stripe issues a proration invoice (`invoice.created` with `billing_reason="subscription_update"`), the platform webhook handler in `webhooks.routes.ts:146-205` has no branch for `invoice.created` or `invoice.upcoming` — only `invoice.paid` and `invoice.payment_failed`. A mid-cycle upgrade therefore leaves the local row updated (tier flipped immediately on `subscription.updated`) but no record of the proration amount actually charged or owed.
- **Status:** MISSING
- **Testable:** false
- **Persistence:** none for proration today.

### P2 — State machine: no `trialing` → `active` transition handling, no `paused`, no `incomplete_expired`
- **Where:** `saas-subscription.service.ts:104-110`.
- **Symptom:** The service blindly mirrors `sub.status` (string) into `subscriptions.status`. Stripe Subscription status enum includes `trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired | paused`. The `markPastDue` / `markActive` helpers only handle the past_due ↔ active edges; `unpaid`, `incomplete_expired`, `paused` arrive only via the generic upsert and never trigger middleware lockout. Trial expiry (`trial_will_end`) is not handled at all.
- **Status:** PARTIAL
- **Testable:** false
- **Persistence:** `subscriptions.status` carries the raw Stripe status but with no derived `tenantBlocked` boolean and no mapping to `organizations.paymentStatus`.

### P3 — `markPastDue` / `markActive` are not idempotent against out-of-order webhook delivery
- **Where:** `saas-subscription.service.ts:151`, `:173`.
- **Symptom:** Both unconditionally overwrite `status` + `pastDueAt`. No guard that ignores a `markActive` whose corresponding `invoice.paid` event timestamp is older than the existing `pastDueAt`. (See P1 idempotency above.)
- **Status:** PARTIAL
- **Testable:** false

### P3 — `STRIPE_PRICE_*` env resolution does triple-fallback at every call (`cloudflare:workers` → `globalThis.env` → `process.env`)
- **Where:** `saas-subscription.service.ts:31-44`.
- **Symptom:** `getEnvVar` swallows the `require("cloudflare:workers")` error silently (`:38`) — if Workers env binding fails (broken bundle), the service silently uses `process.env` (undefined in Workers), and every priceId falls back to `"basic"`. No telemetry. Defensive but hides config bugs.
- **Status:** OK-with-risk
- **Testable:** false

### P3 — `clampInt32` silently caps enterprise org limit to 2^31-1 (`saas-subscription.service.ts:70-73`)
- **Symptom:** Documented behavior, but no admin-visible warning when it triggers. Enterprise tier marketed as "unlimited" → stored as 2147483647. Surfaces as a real limit in any UI binding directly to this column.
- **Status:** OK-with-risk
- **Testable:** false

### P3 — Stub/TODO/FIXME scan
- No literal TODO / FIXME / XXX strings in `saas-subscription.service.ts`. Header comment cites ADR-0002 / ADR-0009 / Task 9 / Task 12 / Task 15 — all DONE per file content. No stubs in this service file.

## Persistence Summary (write-paths)

| Path | Writes | Surfaced in admin UI? |
|---|---|---|
| `upsertSubscriptionFromStripe` | `subscriptions` (INSERT … ON CONFLICT UPDATE), `organizations.subscriptionId` (UPDATE when metadata.organizationId present) | Yes — `apps/server/src/routers/admin.ts` lists subscriptions/orgs. |
| `markPastDue` | `subscriptions.status`, `pastDueAt`, `gracePeriodEndsAt` | Indirectly via admin org list — not as a discrete event row. |
| `markActive` | `subscriptions.status`, clears `pastDueAt`, `gracePeriodEndsAt` | Same — no event row. |
| Cancellation (subscription.deleted) | `subscriptions.status="canceled"` via generic upsert. NO write to `organizations.paymentStatus`. | No middleware lockout fires (gap P1/P2 above). |

Audit log: NONE. No write to `audit_log`, `platform_payment_ledger` (except `invoice.paid` for SaaS revenue), or a dedicated `subscription_events` table.

## Testable:true count

**0**

All findings require: (a) forging signed Stripe webhooks against `/webhooks/stripe/platform`, or (b) inspecting control-panel DB rows that have no Playwright-reachable admin surface in the tenant-scoped web app. The platform-admin app exists (`platform-admin-tenants-billing.ts`, `admin.ts`) but is out-of-scope for tenant-Playwright runs.

## 5-line summary

1. `saas-subscription.service.ts` (193 LOC) exports 4 functions; all are wired into the platform Stripe webhook handler in `webhooks.routes.ts` — none are orphans.
2. P1 break: lifecycle never writes `organizations.paymentStatus`, so `orpc-tenant.middleware.ts:149-160` lockout is dead-code for the SaaS flow — a canceled or past-due Stripe subscription does NOT block the tenant.
3. P1 break: no past-due → suspended sweeper; `gracePeriodEndsAt` is set but never enforced by any cron; the 7-day grace constant is hardcoded (`:28`).
4. P1 break: no audit trail on any lifecycle transition; `platform_payment_ledger` is written only for `invoice.paid`, not for past_due / canceled / tier-change.
5. P2 gaps: unknown priceId silently falls back to basic; proration / mid-cycle plan change / `invoice.created` / `trial_will_end` are NOT handled; out-of-order webhook redelivery can clobber past_due with stale active. Testable:true count = **0** (no tenant-facing UI surface).
