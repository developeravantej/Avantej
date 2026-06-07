# Seeded-environment plan — closing the last deferred e2e rows

After the e2e-deep effort the coverage ledger sits at **228 covered / 13 deferred /
0 uncovered / 0 failing**. The 13 remaining rows are NOT authoring gaps — they need
infrastructure that can't be stood up from a test spec without external credentials
or destructive shared-state changes. This document scopes exactly what each needs.

## The 13 deferred rows

| Module | Rows | What's blocked |
|---|---|---|
| payment | 8 | Stripe Connect money-movement (createPaymentIntent, chargeSavedCard, Stripe refund, application_fee, idempotency keys, precondition gates, invoice create/update) |
| multi-tenant | 3 | cross-tenant mismatch guard, per-tenant DB resolution, no-member-row FORBIDDEN |
| saas | 2 | suspended/cancelled 403; past-due → read-only write block |

(The 4th multi-tenant row — unknown-org → 403 — and the rbac node-scope row were
closed this session without infra.)

## 1. payment (8 rows) — Stripe test mode + a connected account

**Needs (from you):**
- A Stripe **test-mode** secret key (`sk_test_…`) wired into the server env the dev
  worker reads (`STRIPE_SECRET_KEY` or equivalent in `apps/server/.dev.vars`).
- A Stripe **Connect** test connected account for the test tenant/branch
  (`acct_…`), stored on `partner_stripe_accounts` for the org, so
  `createPaymentIntent`/`chargeSavedCard`/refund can attach `application_fee_amount`
  and a destination.
- A test card / PaymentMethod token (Stripe's `pm_card_visa`) for off-session charge.

**Then the spec can (all test-mode, no real money):**
- create a PaymentIntent for an appointment → assert `status`, `application_fee_amount`
  = `computeApplicationFee(amount)`, and the deterministic idempotency key
  (`pi:appt:<id>`).
- chargeSavedCard off_session with `pm_card_visa` → assert succeeded.
- refund a paid intent → assert refunded; assert refund requires
  `paid + stripePaymentIntentId + stripeConnectedAccount`.
- assert createPaymentIntent/sendPaymentLink → PRECONDITION_FAILED when the account
  isn't onboarded.
- invoice create/update (non-Stripe part) can be covered alongside.

**Safety:** test-mode keys only; never a live key. All amounts are play money.

## 2. multi-tenant (3 rows) — a second provisioned tenant + cross-tenant user

**Needs (from you / a seed script):**
- A **second organization** with its own Neon tenant branch (provisioned via the
  normal onboarding / `neon.service` path — this is server-only and slow, so do it
  once via a seed script, not per-run).
- A user who is a member of **org A but not org B** (already exists: franchisee), and
  ideally a user who is authenticated but a member of **neither** for the no-member case.
- Captured org id `B` + a storageState for a user in B.

**Then the spec can:**
- as a user whose context is org A, send a write with `organizationId = B` →
  assert FORBIDDEN (assertOrgContextMatch mismatch).
- as a user in A, read B's data by id → assert 403/404 (tenant DB isolation —
  proves each procedure runs against the org-resolved tenantDb).
- as an authenticated user with no member row in B → assert FORBIDDEN (member=undefined).

**Effort:** the second-tenant provisioning is the real cost. A `seed-second-tenant.ts`
script that creates org B + a member + writes `_e2e/.auth/orgB.json` makes this repeatable.

## 3. saas (2 rows) — subscription-state fixtures on a throwaway org

**Needs:**
- The ability to set an org's subscription/`paymentStatus` to `suspended`,
  `cancelled`, and `past_due` (control-panel DB / a platform-admin procedure).
- **Do NOT** flip the working test tenant — it would break every other spec mid-run.
  Use a **dedicated throwaway org** (can reuse org B from §2) whose state you can
  freely toggle.

**Then the spec can:**
- as a member of the suspended/cancelled org → any procedure returns 403
  `{error:"Tenant is suspended"|"Tenant is cancelled"}`.
- as a member of a past-due-past-grace org → a write procedure (create*/update*/delete*)
  is blocked `SAAS_PAST_DUE_READONLY`, while a read still succeeds.

## Recommended build order

1. **seed-second-tenant.ts** (unblocks multi-tenant + saas at once — org B doubles as
   the suspendable throwaway). Highest leverage: 5 of the 13 rows.
2. **Stripe test-mode wiring + partner_stripe_accounts seed** (unblocks payment, 8 rows).
3. Author the specs above; alias the modules in `update-ledger.mjs` to their folders
   (remove the priority DEFERs as each is genuinely covered); re-run + sync.

## Ledger wiring notes (so coverage stays honest)

`update-ledger.mjs` is module-level. To avoid overstating, each module's priority
DEFER must be narrowed/removed only for rows a real spec actually exercises — the same
pattern used this session for multi-tenant (covered the unknown-org row, kept the other
3 deferred via a priority DEFER). Do NOT alias a module to a folder and let one spec
mark all its rows covered unless every row is genuinely tested.

## What this is NOT

None of this is more test-writing against the current environment — that path is
exhausted (every row reachable without infra is covered). This is environment setup.
Until the Stripe keys / second tenant exist, the 13 rows stay honestly deferred.
