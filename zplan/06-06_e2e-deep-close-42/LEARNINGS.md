# E2E-deep session — durable gotchas (cost real time; avoid next run)

## Tooling traps in `_e2e/`

1. **`reconcile.mjs` title parser chokes on apostrophes.** A test title containing
   `'` (e.g. "the admin's node tree", "order's remaining") parses as a truncated
   title → the journey shows as an ORPHANED drift and `build-review.mjs` refuses.
   **Rule: never put an apostrophe in a `test("…")` title.** Hit this 4× this session.

2. **`report.json` is overwritten every run, and `update-ledger.mjs` syncs from it.**
   Running a SCOPED spec (`… _e2e/web/payment`) overwrites the report with just those
   tests, so the next `update-ledger.mjs` marks everything else uncovered (the
   "partial-report trap"). **Always do the authoritative ledger sync from a FULL
   `bunx playwright test` run.** `build-review.mjs` guards against this; `update-ledger.mjs`
   does not.

3. **`update-ledger.mjs` is MODULE-LEVEL + ALIAS-gated.** A row is covered if its
   module's web folder has any passing deep spec. New modules need an `ALIAS` entry
   (`households: ["households"]`, `payment: ["payment"]`, etc.) or the row never maps
   and silently stays uncovered/deferred. To cover SOME rows in a module while keeping
   others deferred, use a `priority:true` DEFER entry (added this session) that wins
   over module-level coverage. Match on `r.entity` too, not just `r.op`/`r.rule`.

4. **`hierarchy/listNodes` returns `{ nodes: [...] }`, not a bare array.** Generic
   `Array.isArray(x)?x:(x?.nodes??[])` handling is needed (several list procs differ:
   audit/cancelled-sales use `{rows,total}`, customer dir uses `{rows}`).

## Domain / fixture facts (this tenant)

- Single org only: `996febce-…` "Test Fitness Franchise" (Neon `polished-cherry-53783477`).
  No second tenant exists → multi-tenant/saas rows need `seed-second-tenant.ts`.
- `members.create` needs an already-registered, not-yet-member user. `developer.avantej@gmail.com`
  works as a net-zero throwaway member (create→exercise→remove).
- `packages/create` needs exactly one owner (`clientId` XOR `walkInCustomerId`).
- `salesOrders/create` needs NO line items — `{date,customerName,createdBy,branchId,totalAmount}`.
  For refunds it must carry a real `customerId` (auto-derive) — use a customerDirectory userId.
- Connect accounts resolve **per branch country**: MY branches (`0ca11a66`, `0b3158c7`) have a
  charges-enabled `acct_`; the SG branch (`8662e918`) does not → its createPaymentIntent 412s
  (that's how the no-account precondition row is covered).

## Stripe — the big unlock

- The dev-shared **TEST** sandbox is already fully wired in `apps/server/.dev.vars`
  (`sk_test_`, publishable, webhook secrets, Connect client). No dashboard fetch needed.
- **The `stripe listen` signing secret already MATCHES `STRIPE_*_WEBHOOK_SECRET`** in
  `.dev.vars` (stable per-account) → run the listener with NO config change / NO restart.
- Confirm a PI/SetupIntent on a connected account from a test: raw
  `POST api.stripe.com/v1/{payment_intents|setup_intents}/{id}/confirm` with
  `payment_method=pm_card_visa` **+ `return_url`** (required — the PI enables redirect
  methods), header `Stripe-Account: acct_…`. Without `return_url` → 400.
- Webhook flips happen async; poll `getPaymentStatus` / `listSavedCards` (~15s). Gate
  these specs behind `E2E_STRIPE_WEBHOOKS=1` so the normal suite skips them.

## Bug fixed

- `cancelSalesOrder` (`packages/services/src/sales-order.service.ts`) minted a fresh
  `nextval` on every call → an order could get two cancellation numbers. Fixed to reuse
  `existing.cancellationNumber` when set. Unit + e2e covered.

## Final ledger: 235 covered / 6 deferred / 0 uncovered / 0 failing
Remaining 6 = multi-tenant 3 + saas 2 (need `seed-second-tenant.ts` provisioned — billable
Neon branch, operator decision) + payment 1 (invoice has no standalone procedure — backend
design question, not a test gap).
