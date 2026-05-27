# Iteration 7 — Phase C: stripe.transfers.create initiation

## Target
The originating side of the Stripe payout chain. Iteration 5 added the partner onboarding scaffold; iteration 6 added the webhook receivers. This iteration closes the loop: when an operator clicks "confirm via Stripe" on a `pending` payout, fire `stripe.transfers.create` to the partner's Connect account.

## Service
`apps/server/src/services/confirm-payout-via-stripe.service.ts`:
- Single transaction holds the SELECT … FOR UPDATE lock through the Stripe API call (low-volume admin operation; lock duration acceptable).
- Idempotency key `confirm-payout:<payoutId>` — a network-drop retry returns the existing transfer instead of double-paying.
- Guards (ordered): row exists → status is `pending` → method is `stripe_connect` → partner has Connect account → partner.payoutsEnabled. Each maps to a distinct `ConfirmPayoutError` code (`NOT_FOUND`, `BAD_REQUEST_STATUS`, `BAD_REQUEST_METHOD`, `PARTNER_NOT_ONBOARDED`, `PARTNER_NOT_PAYOUTS_ENABLED`, `STRIPE_TRANSFER_FAILED`).
- On Stripe success: stamps `stripeTransferId`, sets `status='paid'`, flips linked `commission_splits` to paid (matches `markPayoutPaid` shape), writes `payout.confirm_via_stripe` audit row with destination + amount + currency + Stripe transfer id.
- Stripe client is injectable (`StripeTransfersClient` interface) for tests; production uses `getStripeClient()`.

## Router
`partnerStripe.confirmViaStripe({ organizationId, payoutId })` — admin-only via `protectedProcedure`. Maps `ConfirmPayoutError` codes:
- `NOT_FOUND` → `ORPCError("NOT_FOUND")`
- `BAD_REQUEST_*` + `PARTNER_*` → `ORPCError("BAD_REQUEST", { message })`
- `STRIPE_TRANSFER_FAILED` → `ORPCError("BAD_GATEWAY", { message })`

## Enum threading
Added `"stripe_connect"` to:
- `RunBatchParams.paymentMethod` (service)
- `ProcessForRecipientParams.paymentMethod` (service)
- `payouts.runBatch.paymentMethod` Zod enum (router)
- `payouts.processForRecipient.paymentMethod` Zod enum (router)

`runBatch` already inserts at status `pending` when `confirmImmediately: false`. The new path: operator runs a batch with `paymentMethod: "stripe_connect"`, `confirmImmediately: false` → payouts land at `pending`. Operator then calls `partnerStripe.confirmViaStripe(payoutId)` per row (or via a future bulk procedure) to fire the actual transfer.

## Runtime proof — 8/8 unit tests, 104 ms
`apps/server/src/services/confirm-payout-via-stripe.service.test.ts`:
- `NOT_FOUND` when payout row is absent.
- `BAD_REQUEST_STATUS` when payout is already paid.
- `BAD_REQUEST_METHOD` when paymentMethod is `cash`.
- `PARTNER_NOT_ONBOARDED` when no partner Stripe row.
- `PARTNER_NOT_PAYOUTS_ENABLED` when partner is restricted.
- `STRIPE_TRANSFER_FAILED` when stripe.transfers.create throws — error message propagates.
- **Happy path**: Stripe called with correct amount / currency / destination / metadata + idempotency key `confirm-payout:payoutId`; payouts row UPDATEd with `status=paid` + `stripeTransferId`; linked commission_splits UPDATEd to `paid`.
- `ConfirmPayoutError` carries code + message + name for downstream mapping.

Combined with iterations 5 + 6, the partner Stripe test suite is **29/29 pass, 270 ms** across:
- partner-stripe.service.test.ts (11)
- partner-stripe-webhooks.service.test.ts (10)
- confirm-payout-via-stripe.service.test.ts (8)

## Gate
- `cd packages/services && bun run build` — clean (services dist regenerated for the new enum value).
- `bunx tsc --noEmit -p apps/server` — clean on changed files (7 pre-existing test-helper errors unchanged).

## What's NOT in this commit
- UI: button on the payouts tab (`apps/web/src/features/payouts/`) that calls `partnerStripe.confirmViaStripe`. Operator triggers the flow via the oRPC procedure; UI follow-up is straightforward (single mutation + toast). Deferred so this commit stays scoped.
- Bulk-confirm procedure (`confirmAllViaStripe({ payoutIds: [...] })`) — operator can iterate by row for now.
- A `payout.confirm_via_stripe.failed` audit row when Stripe rejects (the current code throws; failure is logged via the `ConfirmPayoutError` thrown from the procedure, but no DB audit row is written for the failure path. Future enhancement if ops want failed-attempt history.).
- Live-Stripe integration test (would require a test-mode platform Stripe key + a real or stubbed Connect account; unit tests cover the routing/decision logic comprehensively).

## Status
- **Phase C → complete**. The full chain is now end-to-end:

```
operator clicks confirm
  → partnerStripe.confirmViaStripe(payoutId)        [router]
  → confirmPayoutViaStripe(...)                     [service, this iteration]
  → stripe.transfers.create({ ..., metadata })      [Stripe SDK]
  → local row UPDATE: status=paid, stripeTransferId
  → linked commission_splits → paid                  [matches markPayoutPaid]
  → audit row payout.confirm_via_stripe
                                                     ↓ (async, ~ms-to-seconds later)
                              transfer.created webhook arrives
  → handleTransferEvent (iteration 6)                [service]
  → recognises payout already paid → idempotent stamp
                                                     ↓ (if Stripe reverses later)
                              transfer.reversed webhook
  → handleTransferEvent → markPayoutFailed
```

## Files changed
- `apps/server/src/services/confirm-payout-via-stripe.service.ts` (new)
- `apps/server/src/services/confirm-payout-via-stripe.service.test.ts` (new)
- `apps/server/src/routers/partner-stripe.ts` (new `confirmViaStripe` procedure)
- `packages/api/src/routers/payouts.ts` (paymentMethod enum)
- `packages/services/src/payouts.service.ts` (paymentMethod type)
- `zplan/.../loop/iteration-7.md` (this log)
