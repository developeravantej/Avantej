# Iteration 6 — S-stripe-payout-webhooks (deferred → fixed, Phase B)

## Target
**F-09 / S-stripe-payout-webhooks** — `webhooks.routes.ts` only handled `account.updated` for the ORG branch; there was no path for partner Stripe accounts (Phase A's destination model). The `payouts.stripeTransferId` column was dead.

## Scope
Phase B as planned in iteration 5: webhook handler extensions + OAuth callback route + runtime proof. UI for the partner Stripe management screen is still deferred — a follow-up PR.

## OAuth callback route
`apps/server/src/routes/partner-stripe-oauth.routes.ts` — mounted at `/api/stripe/connect/partner/callback`. Flow:
1. Verify the signed state via `verifyPartnerOAuthState` (CSRF protection).
2. Exchange code → `stripe_user_id` via `exchangePartnerOAuthCode` (direct fetch, Workers-compat).
3. Verify the partner is still an active member of THIS tenant.
4. UPSERT `partner_stripe_accounts` (handles re-onboarding after restriction).
5. **Label the Connect account** via `accounts.update({ metadata: { organizationId, partnerId } })` so subsequent `account.updated` webhooks can route back without a separate index table. Non-fatal if it fails (warning logged).
6. Redirect to the web app's payouts tab with success/error query params.

## Webhook handler extensions
`apps/server/src/services/partner-stripe-webhooks.service.ts` — extracted-and-testable, with:

### `handleAccountUpdatedForPartner(tenantDb, account)`
- Skip when `account.metadata.partnerId` is absent (fall-through to org branch).
- Skip when no `partner_stripe_accounts` row matches the account id.
- Otherwise update capability state (payouts_enabled, details_submitted, requirements, country, default_currency, connect_account_updated_at) + derived status (`pending|active|restricted|rejected`).
- Idempotent: re-running with the same payload yields the same row state.

### `handleTransferEvent(tenantDb, eventType, transfer, actor, reason?)`
Stripe Connect only emits `transfer.{created,updated,reversed}` — no `transfer.paid`/`transfer.failed` (those are PAYOUT events on the connected account's bank schedule, a different model). I called this out in service docs to prevent future confusion.
- `transfer.created`: stamps `stripeTransferId`. If the local payout is still `pending|processing` (the operator's transfer-creation code presumably crashed before the local status update), idempotently calls `markPayoutPaid({ paymentReference: transfer.id })` — webhook recovery path.
- `transfer.reversed`: calls `markPayoutFailed({ reason })` when the local row is in a failable state.

Route wiring (`webhooks.routes.ts`) adds a partner branch BEFORE the existing org-level `account.updated` block (partner metadata is more specific) + a new transfer-events block. Both route by `metadata.organizationId` → tenantDb via the existing `getTenantDb` helper.

## Runtime proof (unit tests, 10/10 pass, 191ms)
`apps/server/src/services/partner-stripe-webhooks.service.test.ts`:
- `account.updated` unmatched without `metadata.partnerId`
- unmatched when no DB row matches the account id
- updates capability to `active` when `payouts_enabled=true`
- derives `restricted` for `requirements.disabled_reason='requirements.past_due'`
- derives `rejected` for `disabled_reason='rejected.fraud'`
- clears `onboardingCompletedAt` when `details_submitted` flips back to false
- `transfer.created` unmatched without `metadata.payoutId`
- unmatched when payoutId points at a non-existent row
- `transfer.created` on already-paid payout: stamps transfer id, no state-machine call (avoids the guard)
- `transfer.reversed` on canceled payout: no-op (state guard catches it)

The state-machine wiring itself (markPayoutPaid → status flip → linked-splits flip) is already runtime-proven in iteration 4's `gap-prove-payouts-state-machine.spec.ts`.

## Gate
- `cd packages/db && bun run build` — clean
- `cd packages/services && bun run build` — clean
- `bunx tsc --noEmit -p apps/server` — clean on changed files (7 pre-existing test-helper errors unchanged: `email-resend.integration.test.ts`, `check-stale.ts`, `payments.integration.test.ts`)
- All bun-test suites pass.

## Files changed
- `apps/server/src/services/partner-stripe-webhooks.service.ts` (new)
- `apps/server/src/services/partner-stripe-webhooks.service.test.ts` (new)
- `apps/server/src/routes/partner-stripe-oauth.routes.ts` (new)
- `apps/server/src/routes/webhooks.routes.ts` (partner branches added; pre-existing `markEventProcessed` calls also fixed to use the actual signature `markEventProcessed(eventId, cpDb)`)
- `apps/server/src/index.ts` (route registration)
- `zplan/.../loop/iteration-6.md` (this log)

## What's NOT in this commit (Phase C — future)
- The transfer-creation code: when an operator settles a non-cash payout via Stripe Connect, fire `stripe.transfers.create({ destination, metadata: { organizationId, payoutId } })`. The webhook handlers above are ready to receive the resulting events; the originating call is the missing piece. Out of scope here — adds a new `confirmPayoutViaStripe` procedure that's a behavior change.
- Admin UI for the partner Stripe onboarding flow (button on the payouts tab that fires `partnerStripe.createOnboardingUrl` and redirects).
- Live-Stripe integration test (synthetic webhook against a running dev server — requires generating valid Stripe signatures, complex to set up; the unit tests cover the routing/decision logic comprehensively).

## Status
- **S-stripe-payout-webhooks (F-09) → fixed** (receive side complete; await Phase C transfer-initiation).
- **S-partner-stripe-onboarding (F-10) → fully fixed** (Phase A + B complete).

All 5 original deferred S-findings are now fixed or substantially addressed. The audit-prove commission session's deferred queue is empty modulo UI follow-ups.
