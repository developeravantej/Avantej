# POS Stripe Wiring + Installment/Fixture Hardening + Merge Follow-up Commit

> Handoff prompt generated 2026-06-12 · Branch: checkpoint/6-11 · Project: Avantej

## Mission

Four sequenced workstreams, independently shippable, on the Avantej POS:
1. **Wire POS → real Stripe** so a genuine POS "Online (Stripe)" sale produces a real, payable Stripe PaymentIntent/link (currently it writes a placeholder and nothing appears in Stripe).
2. **Harden the installment E2E** so `pos-checkout-installment-schedule.journey.spec.ts` asserts green instead of skipping.
3. **Make POS E2E fixtures robust** so specs run green without manual data patching.
4. **Commit the merge follow-up** script changes already on disk.

"Done" = each workstream's verification block passes; `bun check-types` stays green throughout.

## Context

**Project:** Avantej — multi-tenant SaaS for gym/fitness management (members, POS, installments, commissions). Per-tenant Neon DB isolation.
**Stack:** Vite + TanStack Router + Better-Auth + oRPC + Drizzle. Cloudflare Workers server. Stripe **Connect** (platform `acct_1TWp7uB3sd6uw5s6` "dev-shared"; test connected account `acct_1TWwNZGk6ShaTZfV`). Playwright E2E (`journeys-e2e` project, auth via `e2e/auth.setup.ts`).
**Branch:** checkpoint/6-11 (just merged origin/main at `b02ef029`).
**Recent work (this session):**
- Merged origin/main (45 conflicts) — `b02ef029`. Migration 0053 shifts hierarchy `branch` depth 4→3.
- POS Stripe E2E: all 3 specs pass (`pos-stripe-checkout`, `pos-stripe-ui-checkout`, `pos-stripe-webhook`). Confirmed via Stripe API the POS path creates **no** real charge.
- Installment POS flow verified correct in DB (RM120 → 3×RM40, #1 paid / #2,#3 pending) but its E2E spec **skips** on a brittle read-back.

## Current State

**Stripe (W1):** POS `recordSale` for `paymentMethod:"stripe"` writes a placeholder intent id `pos_<uuid>` ([packages/services/src/pos.service.ts:675](packages/services/src/pos.service.ts#L675)), sets `amountPaid=0`, leaves order/payment/package `pending` (lines 597, 803, 891). It never calls Stripe. The `payment_intent.succeeded` webhook ([apps/server/src/routes/webhooks.routes.ts](apps/server/src/routes/webhooks.routes.ts), ~591-645) is what flips order→completed, but nothing creates the real PaymentIntent for a POS sale. Real PI/link creation already exists for other flows: `payments/intent.procedures.ts:74`, `payments/link.procedures.ts:127,283`, `payments/purchase.procedures.ts:119`, `payments/saved-card.procedures.ts:174`. The 5 existing PIs on the connected account carry `appointmentId` metadata (appointment flow), confirming POS has never produced one. SP-01 gate (requires `org_country_stripe_accounts.charges_enabled=true`) lives in `pos.ts` ~105-123.

**Installment E2E (W2):** `e2e/pos-checkout-installment-schedule.journey.spec.ts` records the sale fine, then tries to read back installments via `installments.adminOverview` matching `inst.salesOrderId === salesOrderId` → empty → `listByPackageInstance` skipped → UI table `/dashboard/packages/view?tab=installments` not present → `test.skip("installments-table not found and API unavailable")`. Root cause: `getAdminInstallmentOverview` likely doesn't surface `salesOrderId`, or the new instance falls outside `limit:50`. Procedures: `adminOverview` (packages/api/src/routers/installments.ts:176), `listByPackageInstance` (:59). `installments` table HAS a direct `sales_order_id` column.

**Fixtures (W3):** `seed-business-data.ts` errors on duplicate `TEST-PKG-001` (`package_instances_purchase_number_unique`) — not idempotent. Many seeded client members are **orphans** (tenant `members.user_id` with no control-panel `"user"` row) → `members.list` resolves name `user?.name || "Unknown"` → POS member-search can't find them. The earliest-joined client (`4ca63585-922a-418d-9129-7bb1ca2d5555`) was one such orphan; a `"user"` row was manually inserted this session to unblock. `seedMinimalPosFixture`/`pickFirstActiveClient` live in `e2e/helpers/seed-data.ts`.

**Uncommitted (W4):** `apps/server/scripts/seed-business-data.ts` (branch-depth filter fix: drop `depth=4`, match `type=branch` only) and new `apps/server/scripts/fix-first-client-name.ts`.

## Scope

**In scope:**
- `packages/services/src/pos.service.ts`, `apps/server/src/routers/payments/*`, `apps/server/src/routes/webhooks.routes.ts` (W1)
- `e2e/pos-checkout-installment-schedule.journey.spec.ts`, `e2e/helpers/seed-data.ts` (W2, W3)
- `apps/server/scripts/seed-business-data.ts`, `apps/server/scripts/fix-first-client-name.ts` (W3, W4)
- `packages/api/src/routers/installments.ts` + installment service ONLY if `adminOverview`/`listByPackageInstance` must expose `salesOrderId` (W2)

**Out of scope (do not touch):**
- The merge commit `b02ef029` or any merge-resolved file unrelated to these 4 goals
- `routeTree.gen.ts`, generated migration files, ERD artifacts
- The Stripe webhook signature-verification logic (already passing)
- Real/live Stripe keys; never switch out of test mode

## Tasks

**W1 — Wire POS → real Stripe**
1. Decide the integration shape with the Stripe skill: POS Stripe sale should create a **payment link** (Connect, on the org's connected account) carrying `salesOrderId`/`organizationId` metadata — reuse the pattern in `payments/link.procedures.ts`. Do NOT pass `payment_method_types`; use dynamic methods.
2. In `recordPosSale` (or a dedicated follow-up procedure called right after), when `paymentMethod==="stripe"` and SP-01 passes, create the real PaymentIntent/link and persist its real id onto the payment row (replace the `pos_<uuid>` placeholder, or store alongside) so the webhook can correlate.
3. Confirm `webhooks.routes.ts` `payment_intent.succeeded` correlates by that id/metadata and flips order→completed, payment→succeeded, package→active. Add correlation if missing.

**W2 — Harden installment E2E**
4. Make `installments.adminOverview` (or `listByPackageInstance`) reliably expose `salesOrderId` on returned items; verify the service `getAdminInstallmentOverview` selects it.
5. Rewrite the spec's read-back to query `installments.listByPackageInstance` (or a new `listBySalesOrder`) directly instead of the `adminOverview`→UI-table fallback chain; assert exactly `plan.numInstallments` rows with correct per-row amounts.

**W3 — Fixtures**
6. Make `seed-business-data.ts` idempotent: upsert/guard `TEST-PKG-001` (and any other fixed purchase numbers) with `ON CONFLICT DO NOTHING`/existence check.
7. In the seed (or `seedMinimalPosFixture`), auto-create a control-panel `"user"` row (name/email/email_verified) for every active client member lacking one, so no client resolves to "Unknown". Fold the logic from `fix-first-client-name.ts` into the seed and delete the standalone script.

**W4 — Commit**
8. After W3 lands (so the depth fix + idempotency ship together), commit `seed-business-data.ts` and whatever remains of the fixture helpers with a clear message; do not commit throwaway diagnostics.

## Verification

- [ ] W1: a POS Stripe sale via UI or `client.pos.recordSale` produces a real PaymentIntent on `acct_1TWwNZGk6ShaTZfV` — confirm via `curl https://api.stripe.com/v1/payment_intents -u $STRIPE_SECRET_KEY: -H "Stripe-Account: acct_1TWwNZGk6ShaTZfV"` shows it with `salesOrderId` metadata.
- [ ] W1: simulating `payment_intent.succeeded` flips the order to completed and package to active (check DB).
- [ ] W2: `bunx playwright test e2e/pos-checkout-installment-schedule.journey.spec.ts --project=journeys-e2e` → **passed**, not skipped.
- [ ] W3: `bun e2e:seed` runs green twice in a row (idempotent); `pickFirstActiveClient` returns a named client.
- [ ] All: `bun check-types` → 0 errors. POS Stripe trio still green.

## Key References

| Resource | Path / Command |
|----------|---------------|
| POS service (placeholder intent) | `packages/services/src/pos.service.ts:597,675,803,891` |
| Real PI/link creation patterns | `apps/server/src/routers/payments/{intent,link,purchase,saved-card}.procedures.ts` |
| Stripe webhook handler | `apps/server/src/routes/webhooks.routes.ts` (~591-645) |
| Installment procedures | `packages/api/src/routers/installments.ts:59,176` |
| Installment E2E spec | `e2e/pos-checkout-installment-schedule.journey.spec.ts` |
| E2E seed helpers | `e2e/helpers/seed-data.ts` |
| Business seed | `apps/server/scripts/seed-business-data.ts` |
| Stripe account seed | `e2e/scripts/seed-stripe-account.mjs` |
| Run a spec | `bunx playwright test e2e/<spec> --project=journeys-e2e` |
| Type check | `bun check-types` |
| Seed business data | `bun e2e:seed` |

## Constraints

- **Never pass `payment_method_types`** to Stripe (except Terminal) — use dynamic payment methods / `payment_method_configurations`.
- Stay in **test mode**; never use live keys. Recommend restricted keys (`rk_`) over `sk_` where you add new key usage.
- Cross-DB user ids stay `text`, never FK across the control-panel/tenant boundary.
- Tenant schema changes go through the file-based migration workflow (`bun gen:migrations`), never `db:push`.
- Keep router files ≤400 LOC (CI-gated); use folder modules. New folder-module files MUST import procedure builders from `"../../index"` not `"../index"` (the cycle makes rolldown-dts emit `any`).
- Servers must be running for E2E: `bun dev:server` (3020) + `bun dev:web` (3021) separately — bare `bun dev` crashes via native.

## Agent Recommendation

**Suggested agent:** backend-engineer
**Why:** The center of gravity is server-side — Stripe Connect PaymentIntent/webhook wiring, oRPC procedures, Drizzle reads, and Bun-test/Playwright fixtures; the only UI touch is a single E2E spec's assertions.
