# Audit-Prove Commission — Future Work

## Status (2026-05-28)

The `/audit-prove commission` session at `zplan/2026-05-27-0231-audit-prove-commission/` ran 9 iterations, shipped 12 P1/P2 bug fixes (F-01…F-19), 5 originally-deferred S-finding fixes, the 4 named follow-ups (cycle UI, bulk Stripe confirm, failure audit, integration test), and a schema mismatch fix that completed the parallel `lastStripeEventAt` work. All of that is now on PR #32.

What follows is the work the session intentionally left for later — every item is either a multi-day feature build, blocked on an external decision (Stripe market availability), or a small-but-multi-file polish that didn't fit the in-flight PR.

Source-of-truth references:
- `zplan/2026-05-27-0231-audit-prove-commission/REPORT.md`
- `zplan/2026-05-27-0231-audit-prove-commission/audit/findings.json` (P3 items)
- `zplan/2026-05-27-0231-audit-prove-commission/loop/iteration-{3,4,5,6,7,8,9}.md`

| # | Item | Tier | Estimated effort |
|---|---|---|---|
| 1 | Stripe Accounts v2 migration (when MY market opens) | 1 | 5–10 days |
| 2 | Tenant-timezone aware cycle bounds | 1 | 3–5 days |
| 3 | Per-partner Stripe Connect detail page | 1 | 2–3 days |
| 4 | E2E operator flow (onboard → batch → confirm → webhook) | 1 | 3–5 days |
| 5 | Live-Stripe test-mode CI integration | 1 | 2–3 days |
| 6 | P3 commission-engine omnibus (7 small findings) | 2 | 3–5 days total |
| 7 | Bulk `markPaid` / `cancel` procedures (parity with `confirmAllViaStripe`) | 2 | 1–2 days |
| 8 | Cycle policy audit history (who changed it when) | 2 | 1 day |
| 9 | Audit-prove other domains | 3 | 1–2 weeks each |

---

## 1. Stripe Accounts v2 migration (when MY market opens)

### Problem

Partner Stripe Connect onboarding uses **Standard accounts via OAuth** (`apps/server/src/services/partner-stripe.service.ts`), deviating from the Stripe best-practices skill's default recommendation of **Accounts v2 + controller properties**. The reason is ADR-0001 v2: MY-registered platforms are restricted to Standard accounts; Express/Custom (and the controller-property model) are in private beta for MY.

Once Stripe opens v2 to MY, the codebase should migrate so we get:
- Explicit `controller.losses.payments`, `controller.fees.payer`, `controller.stripe_dashboard.type` — no opaque legacy "Standard / Express / Custom" labels.
- Cleaner liability + dashboard configuration per account.
- Forward compatibility with newer Stripe Connect features that ship v2-only.

### Why deferred

Blocked on an external timeline (Stripe's MY rollout). The existing Standard + OAuth implementation is correct + compliant today; migrating early would mean opting into private beta with no clear win.

### Scope when picked up

- Migration plan for existing `partner_stripe_accounts` rows (keep the same `stripe_account_id`, just update the `account_type` and onboarding flow).
- New service: `partner-stripe-v2.service.ts` using `POST /v2/core/accounts` instead of OAuth.
- Dual-path support during cutover — operators can onboard new partners via v2 while existing OAuth-onboarded ones continue working until refreshed.
- Update the type stub in `packages/api/src/routers/_types/server-router-types.ts:partnerStripeRouterType` if the response shape changes.
- Re-test `confirmPayoutViaStripe` — transfer mechanics are unchanged but verify on a v2-created account.

### Acceptance

- New tenant member can onboard via v2 (no OAuth redirect) end-to-end against Stripe test-mode.
- Existing OAuth-onboarded partner accounts continue receiving transfers without re-onboarding.
- ADR-0001 amended to record the migration date + decision rationale.

---

## 2. Tenant-timezone aware cycle bounds

### Problem

`packages/services/src/commission-cycle.service.ts:deriveCycleBounds` does all math in UTC. For a Malaysia-based franchise that's MYT (UTC+8), a cycle described as "22nd → 22nd" actually rolls over at 08:00 local time on the 22nd, not midnight. The cap-window for a commission earned at 23:30 local on the 21st falls into the wrong cycle.

### Why deferred

Needs a tenant-level `timezone` field (currently absent — every datetime is UTC end-to-end). Schema migration on `organizations` plus a settings UI plus a careful audit of every existing `Date.UTC(...)` call to decide which ones become local-timezone-aware. Cross-cutting.

### Scope when picked up

- Migration: add `organizations.timezone text default 'UTC'` (control-panel).
- `commission-cycle.service.ts` — accept a `timezone` parameter on `resolveCycleBoundsForDate` + `deriveCycleBounds`. Use a small TZ helper (`luxon`-style) rather than pulling all of moment-timezone.
- Settings UI: tz picker on the organization page.
- Audit: which other `Date.UTC(...)` call sites in the commission / payout pipeline care about local midnight? (Likely: `getMyCommissions`, `liabilitySummary`, `recipientSummary.avgPerCycle` grouping by `paidAt::date`.)

### Out of scope

- Per-branch timezone overrides (rare in practice — defer until requested).
- Migrating historical commission_splits row math (UTC math was the only choice when those rows were earned — no retroactive shift).

### Acceptance

- Set tenant tz to `Asia/Kuala_Lumpur`, configure `monthly_anchored(22)`, complete an appointment at 2026-05-21 23:30 MYT.
- `applyCommissionCaps` resolves the cycle as April 22 00:00 MYT → May 22 00:00 MYT (= April 21 16:00 UTC → May 21 16:00 UTC), NOT April 22 00:00 UTC → May 22 00:00 UTC.
- Existing UTC-tenant unit tests still pass unchanged.

---

## 3. Per-partner Stripe Connect detail page

### Problem

`apps/web/src/features/payouts/components/partner-stripe-card.tsx` is compact by design — picks a partner, shows the cached status, lets you fire onboarding or refresh. For day-to-day ops on a tenant with dozens of coaches, the operator needs:

- A per-partner detail route with full Stripe Connect status (capability flags, requirements rendering, document upload links).
- Transfer history table — every `stripe.transfers.create` ever fired for this partner, with `paid` / `reversed` status from the webhook receivers.
- Country picker (current card pre-fills from the partner's profile or leaves blank; a dedicated page lets ops correct).

### Why deferred

UI-only work; not blocking the operator (compact card unblocks the core flow). Several screens deep — partner index page + detail page + transfer history table + country edit dialog.

### Scope when picked up

- New route: `/dashboard/settings/partner-stripe` (index of all coaches with cached status pills).
- Detail route: `/dashboard/settings/partner-stripe/$partnerId` (full status, requirements, transfer history).
- New oRPC procedure: `partnerStripe.listTransfersForPartner({ partnerId })` reading `payouts` filtered to `paymentMethod='stripe_connect'` for that recipient.
- Reuse `PartnerStripeCard` as a header summary on the detail page.

### Acceptance

- Operator can see every coach's Stripe Connect status without picking from a dropdown.
- Detail page renders all `requirements_currently_due` + `requirements_eventually_due` with Stripe deep-links.
- Transfer history shows every transfer + its webhook-driven final state (paid / reversed).

---

## 4. E2E operator flow (onboard → batch → confirm → webhook)

### Problem

The Phase A/B/C work (commits `831636c4`, `d4afe157`, `aa993e8b`) is unit-tested + the bulk operation has an integration test (`confirm-payout-via-stripe.integration.test.ts`). But there's no e2e test that simulates the full operator flow against a running dev server:

1. Operator opens payouts tab → fires `partnerStripe.createOnboardingUrl`.
2. Stripe-hosted OAuth completes (test mode) → callback hits `/api/stripe/connect/partner/callback` → `partner_stripe_accounts` row UPSERTed.
3. `account.updated` webhook lands → capability state updates → status pill goes from `Pending` to `Active`.
4. Operator runs a batch with `paymentMethod='stripe_connect'`, `confirmImmediately:false` → payouts at `pending`.
5. Operator clicks Confirm via Stripe → `stripe.transfers.create` fires → row flips to `paid`.
6. `transfer.created` webhook lands → no-op idempotent confirm.

### Why deferred

Requires a real Stripe test-mode platform account configured for the test runner (more than CI usually wants to set up), webhook forwarding via Stripe CLI, and a careful sequence with real network calls. Higher-value once Stripe Accounts v2 is in (item #1) and a dedicated detail page exists (item #3) — both of which change the click-paths.

### Scope when picked up

- New Playwright spec under `e2e/`: `gap-prove-partner-stripe-e2e.spec.ts`.
- Stripe CLI invocation in CI to forward webhooks to the test runner.
- Test-mode platform Stripe key stored as a CI secret (not in `.dev.vars`).
- The spec records each step as `test.step()` so the video timeline reads like a runbook.

### Acceptance

- Full flow passes against Stripe test-mode in CI (or a documented manual recipe).
- `payouts` row in the test DB goes pending → paid + carries the actual Stripe `tr_test_*` id.

---

## 5. Live-Stripe test-mode CI integration

### Problem

`apps/server/src/services/confirm-payout-via-stripe.integration.test.ts` uses a stubbed Stripe client (`StripeTransfersClient` interface). The full end-to-end DB + state-machine assertions are real, but the Stripe call itself is mocked. A genuine "does this actually work against Stripe?" gate doesn't exist.

### Why deferred

CI needs a Stripe test-mode platform key + isolation from rate limits + a test Connect account. None of those exist as CI infra today.

### Scope when picked up

- Provision a Stripe test-mode platform account dedicated to CI.
- Store the secret key in CI's secret store (NOT `.dev.vars` — that's checked-in-adjacent).
- New test file `confirm-payout-via-stripe.stripe-live.integration.test.ts` (matches the existing `payments.stripe-live.integration.test.ts` pattern).
- Seed a real Stripe Connect test account once + reuse — don't create one per run.
- Assert: `stripe.transfers.create` actually fires, returns a `tr_test_*` id, the local DB row updates, and `payouts` becomes `paid`.

### Acceptance

- CI runs the live-Stripe test on every PR touching `apps/server/src/services/confirm-payout-via-stripe.service.ts`.
- One run takes < 10 s (rate-limit-safe via idempotency key reuse).

---

## 6. P3 commission-engine omnibus

Small findings logged in the audit but not actioned because each is < 1 hour and they're cheaper to batch. From `audit/01-commission-engine.md` + `audit/02-commission-lifecycle.md` + `audit/03-payouts.md`.

### The list

| Finding | File:line | Cost |
|---|---|---|
| N+1 in `getConfigsMissingRateForTier` (30 configs × 5 conditions = 150 round trips) | `packages/services/src/trainer-tier.service.ts:237` | 1 GROUP BY query replaces the nested loop |
| `voidCommissionSplitsForSalesOrder` per-row appointment status SELECT (N+1) | `packages/services/src/commission-splits.service.ts:855` | Single `IN` query |
| `markPaidBatch` no reconciliation key — two batch-pay calls in same period produce indistinguishable audit rows | `packages/services/src/commission-splits.service.ts:1160` | Add optional `paymentReference` param mirroring `markPaidById`'s shape |
| `deactivateTrainerTier` exported but no caller — orphan | `packages/services/src/trainer-tier.service.ts:137` | Either expose a procedure or delete the function |
| `markPaidBatch` exported but no caller within owned files — orphan | `packages/services/src/commission-splits.service.ts:1160` | Wire to a router or delete |
| `commission-math.computeFinalAmountCents` accepts NaN silently (`Math.floor(NaN)` → NaN → DB writes NaN cents) | `packages/services/src/commission-math.ts:104` | `Number.isInteger` guard at the boundary |
| `liabilityByStaff` LIMIT 500 silent — no `nextCursor` / `truncated` flag for orgs with >500 trainers | `packages/services/src/commission-splits.service.ts:1379` | Return `{ truncated: boolean }` or bump the limit |
| `getLatestConfigVersionForCategory` exported but `_buildSplits` never snapshots `configVersionId` on inserted rows — dispute-reproducibility advertised in docstring is lost | `packages/services/src/commission-splits.service.ts:1652` vs `commission-calculator.service.ts:619` | Wire `configVersionId` into the INSERT in `_buildSplits` |

### Why deferred

Each is < 1 hour. Batching gives one PR + one type-check round + one set of release notes. None individually warrants its own session.

### Acceptance

All 8 items resolved in one PR; type-check stays green; no behavior regressions in existing journey specs.

---

## 7. Bulk `markPaid` / `cancel` procedures

### Problem

`partnerStripe.confirmAllViaStripe` exists (PR #32 / `ac46e92c`) but the parallel single-row state-machine actions (`payouts.markPaid` / `markFailed` / `retry` / `cancel`) have no bulk variants. Operators handling a 50-row failed batch via UI click each row individually.

### Why deferred

The single-row dialogs work; bulk is a UX optimisation rather than a correctness fix. Cleaner to land after operators have used the single-row flow for a while and we know which bulk grain matters (per-row OK + reason list? per-row reason needed?).

### Scope when picked up

- `payouts.markAllPaid({ ids, paymentReference })` — same idempotency + FOR UPDATE pattern as `confirmAllViaStripe`. Per-row audit. Single shared `paymentReference` for the batch (UI prompt collects once, server stamps on every row).
- `payouts.cancelAll({ ids, reason })` — similar shape.
- Update `apps/web/src/features/payouts/api.ts` with the two new hooks.
- Surface in the payouts table via row-selection checkbox + bulk action bar.

### Acceptance

100 selected pending rows can be marked paid in one operator action; bulk result reports per-row outcomes.

---

## 8. Cycle policy audit history

### Problem

`commission_cycle_configs` rows have `updated_by` + `updated_at` (last-modified only). No history of who changed the policy when. For a finance-impacting setting, that's thin — a tenant disputing a payroll period boundary deserves the question "was the policy edited last week?" to be answerable.

### Why deferred

The single-row tracking is enough for the v1 admin UI. History needs a separate `commission_cycle_config_versions` table + writes on every upsert + a tab in the admin UI. Single-session lift but not blocking the cap-window fix.

### Scope when picked up

- Migration: `commission_cycle_config_versions` (id, config_id FK, cycle_type, anchor_day, changed_by, changed_at).
- Service: write a version row on every `upsert` inside the same transaction.
- UI: collapsible history panel on the cycle policy row.

### Acceptance

Audit log of cycle policy changes visible in the UI; queryable for finance disputes.

---

## 9. Audit-prove other domains

The `/audit-prove` pipeline (config detection → parallel domain audits → remediation loop → continuous-video proof) is well-trodden after this run. Reasonable candidate domains, in rough order of leverage:

| Domain | Why interesting | Estimated effort |
|---|---|---|
| `customer-profiles` | Stripe Connect partial, magic-link auth, claim flow — complex lifecycle | 1 week |
| `package-instances` | Lifecycle, freeze/unfreeze, soft holds, transfers across staff | 1 week |
| `inventory` | Purchase orders, goods receipts, stock movements, transfer orders | 1 week |
| `scheduling` | Recurring appointments, class slots, trainer availability, intake | 1–2 weeks (largest surface) |
| `expenses` | Approval/claim flow, separation of duties already partly audited | 3–5 days |
| `notifications` | Delivery audit, retry policy, scheduled-reports cron | 3–5 days |

Pipeline reminders for the next runner:
- Detect-then-pin: `node ~/.claude/skills/audit-prove/scripts/detect-project.mjs` writes a heuristic `project.json`; review + correct before the fan-out.
- Beware parallel-session writes on shared files (this session hit `api.ts`, `payouts-tab.tsx`, and the partner-stripe service multiple times). Commit often, push often.
- The `--audit-only` flag is the right escape hatch when you just want the findings without remediation.
- The deep-verification pattern (`gap-prove-*-deep.spec.ts`) caught a regression in the F-15 admin RBAC fix that the original spec missed — always do at least one runtime-seeded e2e after the remediation loop converges.
