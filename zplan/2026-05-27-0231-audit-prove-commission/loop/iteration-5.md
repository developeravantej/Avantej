# Iteration 5 — S-partner-stripe-onboarding (deferred → fixed, Phase A)

## Target
**F-10 / S-partner-stripe-onboarding** — `partner_stripe_accounts` table was orphan. No procedure created a row, no procedure read capability state, no UI surface existed. This blocked S-stripe-payout-webhooks (F-09) since there was no destination model for partner-level webhook events.

## Architecture decision
Stripe best-practices skill default is **Accounts v2** + controller properties. **We deviate** because:
- The platform is Malaysia-registered.
- ADR-0001 v2: MY platforms are restricted to Standard accounts via OAuth (Express/Custom in private beta).
- Existing org-level Connect flow uses Standard + OAuth — partner-level mirrors it for consistency + regional compliance.

Every other skill rule applied:
- HMAC-signed `state` for CSRF protection.
- Stripe-hosted onboarding (no custom PII collection).
- Webhook signature verification (existing path, unchanged here).
- Restricted API keys / IP allowlisting — operational concern, not in this PR.

## State schema (5-part, partner-scoped)
`orgId.partnerId.country.ts.sig`
- Strictly 5 parts — refuses the existing 3- and 4-part org states, preventing cross-flow replay.
- `partnerId` is `members.userId` (the cross-DB text id, same convention as `staffId` in the commission engine).
- HMAC binds all four payload fields — tampering with `partnerId` is rejected.

## Schema (migration 0078)
Added capability columns to the existing `partner_stripe_accounts` table:
- `country_code text`, `default_currency text`
- `payouts_enabled boolean default false` — the gate for "can we send money here?"
- `details_submitted boolean default false`
- `requirements_currently_due jsonb`, `requirements_eventually_due jsonb`
- `requirements_disabled_reason text` — drives the `restricted` / `rejected` derived states
- `connect_account_updated_at timestamptz`
- Index on `payouts_enabled` for ops scans ("show me all partners ready to receive payouts").
- `account_type` default updated from `"express"` → `"standard"` to reflect MY platform constraint.

Migration is idempotent (`ADD COLUMN IF NOT EXISTS`). Defensive backfill of `details_submitted` from existing `onboarding_completed_at`.

## Service layer
`apps/server/src/services/partner-stripe.service.ts`:
- `signPartnerOAuthState({ orgId, partnerId, secret, countryCode? })` — Web Crypto HMAC-SHA256, Workers-compat.
- `verifyPartnerOAuthState(state, secret, maxAgeMs?)` — strict 5-part parse, HMAC verify, expiry check. Returns null on any tampering.
- `buildPartnerOnboardingUrl({ clientId, state, email, businessName, countryCode })` — builds the `connect.stripe.com/oauth/authorize` URL.
- `exchangePartnerOAuthCode({ code, platformSecretKey })` — token-exchange via direct fetch (Workers-compat; same pattern as existing `stripe-connect-oauth.routes.ts`).
- `deriveStripeConnectStatus({ payoutsEnabled, detailsSubmitted, requirementsDisabledReason })` — pure mapping into the 4-state `pending | active | restricted | rejected` enum.

## Router (server-only, needs Stripe SDK)
`apps/server/src/routers/partner-stripe.ts` — registered as `partnerStripe.*` in the server router map:
- `createOnboardingUrl({ organizationId, partnerId, countryCode? })` — verifies partner is an active member of THIS tenant before signing state. Returns `{ onboardingUrl, partnerId }`.
- `getStatus({ organizationId, partnerId })` — returns deterministic shape (always includes the same fields) so callers don't need a separate "exists" check.
- `refresh({ organizationId, partnerId })` — pulls fresh capability state from Stripe and writes it back. Used when the operator suspects the local cache is stale.

All admin-only via `protectedProcedure` (same auth wrapper as `stripeConnect.*`).

## Unit tests (bun:test)
`apps/server/src/services/partner-stripe.service.test.ts` — 11/11 pass, 70ms:
- Round-trip with country recovers all fields.
- Round-trip without country → null countryCode.
- Different-secret HMAC → null.
- Expired state (maxAgeMs=0) → null.
- Malformed base64url → null.
- **4-part legacy org state rejected by partner verifier** (cross-flow replay protection).
- **Tampered partnerId → HMAC fails** (the attacker swap is detected; log line emitted).
- `deriveStripeConnectStatus` matrix: payouts_enabled true → active; false → pending; `rejected.*` disabled_reason → rejected; other disabled_reason → restricted.

```
11 pass · 0 fail · 16 expect() calls · 70ms
```

## Gate
- `cd packages/db && bun run build` — clean (db dist regenerated with new partnerStripeAccounts columns).
- `bunx tsc --noEmit -p apps/server` — clean on the changed files. 7 pre-existing errors in test helpers (`email-resend.integration.test.ts`, `check-stale.ts`, `payments.integration.test.ts`) are unchanged.

## What's NOT in this commit (Phase B — next iteration)
- OAuth callback route (`/api/stripe/connect/partner/callback`) that exchanges the code + persists the partner_stripe_accounts row.
- Webhook handler extensions for `account.updated` (partner branch) + `transfer.created` / `transfer.paid` / `transfer.failed` → `markPayoutPaid` / `markPayoutFailed` chain.
- Runtime proof via synthetic webhook payload against the local server.
- Admin UI for the partner Stripe onboarding flow (deferred to a follow-up).

## Status
- S-partner-stripe-onboarding (Phase A) → **fixed**.
- S-stripe-payout-webhooks (F-09) — partially unblocked; awaits Phase B for end-to-end wiring.

## Files changed
- `packages/db/src/migrations/tenant/0078_partner_stripe_accounts_capabilities.sql` (new)
- `packages/db/src/schema/tenant/partner-stripe-accounts.ts` (capability columns)
- `packages/db/src/generated/tenant-migrations.generated.ts` (regenerated)
- `apps/server/src/services/partner-stripe.service.ts` (new)
- `apps/server/src/services/partner-stripe.service.test.ts` (new)
- `apps/server/src/routers/partner-stripe.ts` (new)
- `apps/server/src/index.ts` (router registration)
- `zplan/.../loop/iteration-5.md` (this log)
