# Iteration 8 — UI follow-ups (payouts row actions + partner Stripe onboarding)

## Target
The PR #32 "deferred follow-ups" listed three UI items; this iteration ships two:
- Per-row `Confirm via Stripe` action on the payouts tab (operators can fire `stripe.transfers.create` on a pending `stripe_connect` payout in one click).
- Partner Stripe Connect onboarding card on the payouts tab (admin picks a coach → starts hosted OAuth → cached status surfaces).

Left for follow-up:
- Admin UI for `commission_cycle_configs` (no design lift yet).
- Bulk `confirmAllViaStripe` procedure.
- Failed-attempt audit row.

## Changes
- `apps/web/src/features/payouts/api.ts`
  - Added 4 hooks: `usePartnerStripeStatus`, `useCreatePartnerOnboardingUrl`, `useRefreshPartnerStripe`, `useConfirmPayoutViaStripe`.
  - Extended `paymentMethod` enum: added `"stripe_connect"`.
- `apps/web/src/features/payouts/components/partner-stripe-card.tsx` (new)
  - Member picker (filters trainer/staff/admin from `members.list`).
  - Cached `getStatus` block: shows connect account id, country, payouts-enabled, outstanding requirements, disabled reason.
  - `Start Stripe onboarding` button (full-page redirect to connect.stripe.com OAuth URL).
  - `Refresh from Stripe` button (re-pulls capability state via `partnerStripe.refresh`).
- `apps/web/src/features/payouts/components/run-batch-drawer.tsx`
  - Added `Stripe Connect` option to the payment-method picker.
- `apps/web/src/components/pages/commissions/payouts-tab.tsx`
  - Per-row `Confirm via Stripe` action visible on pending/processing `stripe_connect` rows. Calls `partnerStripe.confirmViaStripe(payoutId)` directly — idempotent via Stripe's `confirm-payout:<id>` key.
  - Surfaces `<PartnerStripeCard>` above the payout records table when the user has `commission_payout:process` permission.
- `apps/server/src/routers/partner-stripe.ts`
  - **Runtime shape fix**: `getStatus` now returns `{ partnerId, stripeAccountId, connectStatus, chargesEnabled, payoutsEnabled, detailsSubmitted, onboardingCompletedAt, countryCode, defaultCurrency, requirementsCurrentlyDue, requirementsDisabledReason, connectAccountUpdatedAt }` — aligned with the type stub in `packages/api/src/routers/_types/server-router-types.ts:partnerStripeRouterType`. The PR #32 implementation used a different field naming convention (`connected`, `stripeConnectAccountId`, `status`) which would have caused undefined-field reads in the UI; now matched.

## Gate
- `bun run check-types` — 3/3 turbo tasks pass (web + native + server) in 56s.
- All shipped hooks land via the existing `useApiMutation` pattern with proper invalidation (`payoutKeys.list(orgId)` + liability keys).

## Parallel-session note
A separate audit-prove-a session was active in this branch while iteration 8 was in flight. Conflicts surfaced as: api.ts hook block being reverted twice; partner-stripe-card.tsx field names flipping between the two naming conventions. Resolved by aligning the server router's `getStatus` shape to the type stub the parallel session committed (the stub is the type-inference source of truth for the web client). Other parallel-session changes are NOT in this commit set.

## What works after this commit
For a tenant where `commission_payout:process` is held by the admin:
1. Open `/dashboard/commissions/view?tab=payouts` → see the new `Partner Stripe Connect` card at the top.
2. Pick a coach in the dropdown → see current status pill (`Pending onboarding` / `Active` / `Restricted` / `Rejected`).
3. Click `Start Stripe onboarding` → full-page redirect to `connect.stripe.com/oauth/authorize` with HMAC-signed state.
4. Stripe-hosted onboarding completes → callback at `/api/stripe/connect/partner/callback` upserts `partner_stripe_accounts` and labels the Connect account with `metadata: { organizationId, partnerId }`.
5. Operator clicks `Refresh from Stripe` if cache is stale.
6. Run a batch with method=Stripe Connect → payouts land at `pending`.
7. Per-row menu → `Confirm via Stripe` → `stripe.transfers.create` fires → payout flips to `paid`, splits flip to `paid`, audit `payout.confirm_via_stripe` written.

What's still operator-driven via window prompts (not a regression — pre-existing in iteration 4):
- Mark Paid (manual reference)
- Mark Failed (manual reason)
- Retry / Cancel

Upgrading those to proper dialogs is a low-priority polish follow-up.
