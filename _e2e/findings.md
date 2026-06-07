# /e2e-deep — Findings

Issues surfaced by the deep functional E2E pass (2026-06-04). These are app
behaviors the specs exposed, not test bugs. Ordered by severity.

## 1. `coachIntake.unclaimSlot` has no permission gate (HIGH)
- **File:** `packages/api/src/routers/coach-intake.ts:155`
- Any authenticated tenant member (login + org-match only — no permission, no
  self/role check) can delete **any** trainer's intake exception by id.
  Sibling mutations (`upsertSlots`, `claimSlot`) require
  `appointment_management:update` OR self (`member.id === trainerId`).
- **Impact:** a low-privileged staff user can tamper with other trainers'
  availability. Cross-trainer write with no authorization.
- **Fix:** add the same `appointment_management:update OR self` guard used by
  `upsertSlots`/`claimSlot`.
- **E2E status:** documented (not asserted live — needs a non-admin login to
  demonstrate; RBAC-staff is deferred this loop).

## 2. ~~Inventory create 500s~~ — RESOLVED (was a test-harness id collision, NOT a server bug)
- **Earlier (wrong) hypothesis:** a worker resource/connection leak — the create
  500s looked load-dependent (read-heavy shards green, create-heavy shards red).
- **Actual root cause (from the server log, `_e2e/devserver.log`):**
  `DrizzleQueryError: ... duplicate key value violates unique constraint
  "tax_rates_code_idx"` (and the equivalent for products `sku`, promotions,
  installment-plans `code`, suppliers). The harness's `testId()` used a
  **constant** run stamp + a per-process counter, so it regenerated the **same**
  ids every run (`E2E-DEEP-tax-run-1`…). Hard-delete entities are cleaned up, but
  **soft-delete** entities keep their unique `code`/`sku` after "delete" — so the
  next run's identical id collided with the leftover row → masked 500. That's why
  only the soft-delete (create-heavy) modules failed, and why it looked like
  "degradation."
- **Fix (one line, `_e2e/web/_safe-mutation.ts`):** `RUN_STAMP = Date.now()…` so
  every run's ids are globally unique. Re-running the previously-red specs
  (tax-rates, products, promotions, installment-plans, uom, purchase-orders,
  customer-profiles) → **20/20 green**.
- **Note:** the dev web (3021) / API (3020) servers *did* crash a couple of times
  under the repeated full-run load on this Windows box — real but separate dev
  instability; restart with `bun dev:web` / `bun dev:server`.

## 3. Uniqueness violations surface as raw 400/500, not a clean 409 CONFLICT (MEDIUM)
Duplicate-key inserts bubble the raw DB error to the client instead of a mapped
`CONFLICT`:
- `roles/create` (duplicate name) → **400** `"Failed query: insert into \"roles\"…"`
- `rolePermissions/add` (duplicate) → **400** `"Failed query: insert into \"role_permissions\"…"`
- `products/create` (duplicate `sku`) → **500** INTERNAL_SERVER_ERROR
- `installmentPlans/create` (duplicate `code`) → **500** INTERNAL_SERVER_ERROR
- **Impact:** leaks SQL to the client; inconsistent error contract; the UI can't
  show a friendly "already exists" message reliably.
- **Fix:** catch the unique-violation (PG `23505`) in each create path and throw
  `ORPCError("CONFLICT", …)`.
- **E2E status:** the rule specs assert rejection (accept 400/409/500) and carry
  a `FINDING:` comment so the intent is clear without being flaky.

## RBAC-staff — NOW COVERED
Provisioned a verified non-admin staff user (`staff.deterministic@test.com`, role
`staff`) via `apps/server/scripts/seed-e2e-staff.ts`; global-setup logs it in to
`_e2e/.auth/staff.json`. `_e2e/web/access-control/rbac-staff.rbac.spec.ts` now
asserts (green): staff is **403 FORBIDDEN** from `roles/create` and
`invitations/create` at the API, and the create-role control is hidden in the UI.
(Note: `roles/delete` and `hierarchy/createNode` validate input *before* the
permission check, so they return 400 not 403 for a malformed/forbidden call — a
minor inconsistency worth tidying but not a security issue.)

## Deferred (not findings — infra/scope gaps this loop)
- **Multi-tenant isolation specs** — no second tenant login available.
- **RBAC node-scope (branch) boundary** — staff sees only descendant nodes; needs
  a staff user scoped to a deeper branch + sibling data to prove non-leakage.
- **Full POS-sale invariants** (installment per-cycle display, cash under-collect,
  credit-points members-only, no-tax-rate) — need a complete sellable installment
  fixture + tax rate + customer; the per-cycle math is covered by `pos.service`
  unit tests (`pos.service.ts:524-536`).
- **Commission-reaches-trainer (rotation + requested)** — needs an
  appointment-completion → commission chain; covered by `appointment-assignments`
  unit tests.
- **Money settlement** (refund process, payout runBatch/markPaid, Stripe charges)
  — irreversible; needs seeded approved splits / refundable orders and a test
  Stripe Connect account.

## FINDING (2026-06-07) — cancellation-number "reuse" invariant not implemented

**Severity:** low–medium (data-model expectation vs. behavior)
**Where:** `packages/services/src/sales-order.service.ts` `cancelSalesOrder` (~:236-275)
**Expected (documented invariant):** "A cancellation reuses an order's existing
cancellationNumber if set, else mints a new one (an order never gets two cancellation numbers)."
**Actual:** `cancelSalesOrder` calls `generateCancellationNumber` (nextval) unconditionally on
every invocation — there is no `if (existing.cancellationNumber) reuse` short-circuit. An order
cancelled twice (if reachable) would mint a second number. The UNIQUE constraint + the
`refundAmount`-range guard mask this in practice, but the reuse guarantee is absent.
**Impact:** today the cancel path is effectively single-shot per order (status guards), so no
live double-number is observed; the gap is latent. If a re-cancel path is ever added, numbers
would not be reused.
**Recommendation (NOT applied):** in `cancelSalesOrder`, short-circuit when
`order.cancellationNumber` is already set and reuse it; only call `generateCancellationNumber`
when null. Add a unit test for the re-cancel case.
**E2E status:** the monotonic/unique invariant IS covered
(`_e2e/web/cancelled-sales/cancellation-number.rule.spec.ts`). The reuse row is
deferred-with-reason in `update-ledger.mjs` (priority DEFER) pending a product decision.
