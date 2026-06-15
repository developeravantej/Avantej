# Iteration 2 — F-07 row-lock (deferred → fixed)

## Target
**F-07 / S-refund-row-lock** — concurrent `approveRefund` calls against the same parent target can both pass an unlocked cap check and over-commit refunds. Originally deferred at session end.

## Fix (packages/services/src/refunds.service.ts)
1. `SELECT … FOR UPDATE` on the parent row at the top of the `approveRefund` transaction, after the existing refund-row lock:
   - `existing.salesOrderId` → lock `sales_orders.id`
   - `existing.paymentId` → lock `payments.id`
   - `existing.packageInstanceId` → lock `package_instances.id`
2. Hoisted `computeRemaining*` + cap validation OUT of the `approveAmountCents !== undefined` branch so the cap check ALWAYS runs (was previously partial-only).
3. Full-approve over-cap now also rejected with BAD_REQUEST — closes the symmetrical hole where two concurrent `requestRefund` racers could insert pending rows whose sum exceeded the cap, then both be full-approved.

## Gate
- Direct `bunx tsc --noEmit` (services pkg): clean on the changed file.
- `bun run check-types` was initially red on `organization-settings.ts` because the services dist was stale (predated `10e6c169` adding `organization_settings` to `Resource`). After `cd packages/services && bun run build` to refresh the dist, the full monorepo type-check passes: **3 of 3 tasks successful**.

## Runtime proof
Spec: `e2e/gap-prove-f07-refund-lock.spec.ts` (single test, video on).
Config: `gap-prove-f07.config.ts`.

Scenario:
1. POS product sale RM 50 → sales order created.
2. `refunds.request` for the full RM 50 → one pending refund.
3. Fire `refunds.approve` TWICE concurrently via `Promise.all`.

Result:
```
F-07 concurrent approve results: {"r1":{"ok":false,"err":"400"},"r2":{"ok":true,"err":null}}
1 passed (1.2m)
```

- Exactly one call succeeded (r2 committed the approval).
- The other failed with HTTP 400 — the row-lock made it wait, and the post-lock re-read saw `status='approved'`, hitting the existing "Cannot approve refund with status 'approved'" guard.
- Pre-fix, both would have succeeded → double-counted refund vs the sale's totalAmount.

## Status
- S-refund-row-lock → **fixed**.
- 4 deferred S-findings remain (cycle-window-alignment, stripe-payout-webhooks, partner-stripe-onboarding, payouts-state-machine).
