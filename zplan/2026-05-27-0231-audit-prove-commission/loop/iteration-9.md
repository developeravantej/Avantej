# Iteration 9 — payout state-machine action UX polish

## Target
Replace `window.prompt` / `window.confirm` with proper Dialog components for the five payout state-machine actions wired in iterations 4 + 8: MarkPaid · MarkFailed · Retry · Cancel · ConfirmViaStripe.

## Why this isn't cosmetic
Prompt-based UX has three concrete problems:
1. **No input validation feedback** — user types nothing, gets a toast AFTER pressing OK. Dialogs show validation inline + keep submit disabled while invalid.
2. **No context** — the prompt doesn't show recipient / amount / payment method, so operators are confirming "the payout" abstractly. A summary row in each dialog grounds the decision.
3. **No room for rich preflight** — the ConfirmViaStripe path now spells out what fires (`stripe.transfers.create` + idempotency key + capability prereqs) so an operator can self-check before committing to an external API call. Prompts can't render that.

Also: `window.prompt` is blocked by default in modern browsers (Chrome permission), and is non-stylable / non-themeable.

## What landed
**New file** `apps/web/src/features/payouts/components/payout-action-dialogs.tsx` — 5 Dialog components, ~340 LOC total:

| Dialog | Input | Mutation | Notes |
|---|---|---|---|
| `MarkPaidDialog` | `paymentReference` (required, max 200) | `useMarkPayoutPaid` | Enter-to-submit when valid. Auto-resets the field on re-open. |
| `MarkFailedDialog` | `reason` textarea (required, max 1000) | `useMarkPayoutFailed` | Destructive submit button. |
| `RetryPayoutDialog` | — (confirmation only) | `useRetryPayout` | Spells out that `payoutId` linkage on splits is preserved. |
| `CancelPayoutDialog` | `reason` textarea (required, max 1000) | `useCancelPayout` | Warns that linked splits revert to `approved` + `payoutId` cleared. |
| `ConfirmViaStripeDialog` | — (confirmation only) | `useConfirmPayoutViaStripe` | Renders preflight checklist incl. idempotency key + `payouts_enabled` requirement. |

All dialogs share:
- `PayoutSummaryRow` (recipient + amount + method).
- `payout: PayoutListItem \| null` prop — null keeps the dialog closed, passing a row opens it.
- Auto-close on success (`await mutateAsync` → `onClose()`).
- Pending state disables both submit + dismiss buttons so the operator can't fire twice.

**Refactored** `apps/web/src/components/pages/commissions/payouts-tab.tsx`:
- Removed the 4 inline `handle*` functions that wrapped `window.prompt` / `window.confirm`.
- Added `activeDialog: DialogKind | null` state in `PayoutRowActions` (discriminated union: `"markPaid" | "markFailed" | "retry" | "cancel" | "confirmStripe"`).
- Dropdown menu items now just `setActiveDialog("…")` instead of running the mutation directly.
- 5 Dialog components rendered alongside the dropdown — each receives `payout: activeDialog === "…" ? payout : null` so only the active one mounts open.
- Dropped 4 dead type imports (`MarkPaidParams` / `MarkFailedParams` / `RetryPayoutParams` / `CancelPayoutParams`) — they're internal to the dialog components now.

## Gate
`bun run check-types` → **3/3 turbo tasks green** in 49s. Both web and server compile without new errors.

## Files
- `apps/web/src/features/payouts/components/payout-action-dialogs.tsx` (new, ~340 LOC)
- `apps/web/src/components/pages/commissions/payouts-tab.tsx` (-65 LOC inline handlers, +60 LOC dialog wiring; net roughly even, much cleaner)
- `zplan/.../loop/iteration-9.md` (this log)

## Carry-over follow-ups (deferred — same as iteration 8)
- Admin UI for `commission_cycle_configs`.
- Bulk `confirmAllViaStripe` procedure.
- Failed-attempt audit row on Stripe rejection.
- Live-Stripe test-mode integration test.
