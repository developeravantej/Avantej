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

## 0. Testing gaps from this session — verify before any production rollout

The PR #32 work is **type-check green across the monorepo** and several paths have runtime proof, but a meaningful chunk shipped without live-runtime verification. This section is the honest inventory. Order it ahead of any of items #1–9 if you're prepping a production deploy.

### Already runtime-verified — keep ✓

| Surface | Proof | Location |
|---|---|---|
| F-04 createManualAdjustment XOR (BAD_REQUEST, no SQL leak) | Live oRPC hit + DB read-back | `e2e/gap-prove-commission-deep.spec.ts` |
| F-05 paymentReference persistence to row notes | Live API + read-back | `e2e/gap-prove-commission-deep.spec.ts` |
| F-06 refund→reversal flips split to `void` + liability subtracts | Live refund flow + read-back | `e2e/gap-prove-commission-deep.spec.ts` |
| F-08 payout_batches populated by runBatch with non-null batchId | Live API + payouts.list read-back | `e2e/gap-prove-commission-deep.spec.ts` |
| F-15 admin RBAC bypass | Caught + fixed by the deep spec | iter 4 commit `96442a7d` |
| F-07 refund row-lock | Concurrent approveRefund race; exactly one succeeds | `e2e/gap-prove-f07-refund-lock.spec.ts` |
| Payouts state machine LC-01..LC-07 (markPaid/markFailed/retry/cancel) | 2.3 min e2e + concurrent markPaid race | `e2e/gap-prove-payouts-state-machine.spec.ts` |
| `deriveCycleBounds` math (4 cycle types + boundary cases) | 11/11 bun-test, 77 ms | `packages/services/src/commission-cycle.service.test.ts` |
| Partner-Stripe HMAC state signing/verification (incl. tampered partnerId) | 11/11 bun-test | `apps/server/src/services/partner-stripe.service.test.ts` |
| Partner-Stripe webhook handler routing decisions | 10/10 bun-test with mocked Drizzle | `apps/server/src/services/partner-stripe-webhooks.service.test.ts` |
| `confirmPayoutViaStripe` guards + happy path + Stripe rejection + bulk aggregation | 4 integration tests against real tenant DB + stubbed Stripe client | `apps/server/src/services/confirm-payout-via-stripe.integration.test.ts` |

### Type-checked but NOT runtime-verified — verify before production

| Surface | Test gap | Risk if broken | Suggested proof |
|---|---|---|---|
| **F-13 POS conditional-skip audit row** | Tolerant placeholder in original spec; no runtime exercise | Operators won't see a skip reason in audit_log when a POS sale silently produces zero commissions | Seed a conditional commission config with `minQuantity ≥ 5`, fire a POS sale with `quantity=1`, assert one `commission.skip` audit row exists |
| **F-14 `categoryCommission.upsert` OR(create,update)** | Can't swap permissions mid-spec; only checked the code path | Permission migrations could regress this silently | Seed a tenant member granted only `update` (not `create`), call upsert, assert success |
| **F-01 / F-02 `categoryCommission` re-save preserves `isActive` + `includeInactive` flag** | Light assertion in spec — re-fetch confirms but doesn't validate the prior-state preservation under the destructive DELETE+INSERT | A deactivated config could silently reactivate on edit | Integration test: deactivate a config via direct DB UPDATE, re-save via `upsert`, assert `isActive` still false |
| **F-11 `myCommissions` earnedAt filter** | Spec ran with no out-of-window seed data — assertion was effectively vacuous | Returns wrong rows in payroll views if `earnedAt` regresses to `createdAt` | Seed a split with `earnedAt = now − 60d, createdAt = now`, query with current-month window, assert the row is excluded |
| **F-12 `liabilitySummary` lt upper bound (boundary)** | Same — no boundary-timestamped seed exercised | Splits double-counted at month boundaries | Seed a split at exactly `2026-05-01T00:00:00Z`, query both `[Apr, May]` and `[May, Jun]` windows, assert it appears in exactly one |
| **F-19 `recipientSummary.avgPerCycle` excludes reversals** | Spec asserted `≥ 0` only; no reversal seed | Negative reversal rows drag the average down for trainers with clawbacks | Seed 2 paid + 1 negative-reversal row for one staffId, assert `avgPerCycle` equals the mean of just the positives |
| **`partnerStripe.refresh` procedure** | No test at all | A stale-cache refresh could silently fail; capability flags drift from Stripe | Stub a Stripe `accounts.retrieve` return, call refresh, assert row updated |
| **OAuth callback route `/api/stripe/connect/partner/callback`** | No test — manual recipe only | A forged state could slip through (CSRF), or a real callback could miss the UPSERT path | Generate a signed state via `signPartnerOAuthState`, POST to the route with a stub token-exchange, assert `partner_stripe_accounts` row inserted + redirect URL correct |
| **Webhook route dispatcher in `webhooks.routes.ts` (partner branch)** | The handler service is unit-tested; the route-level dispatch wrapping is NOT — `markEventProcessed` calls, header extraction, signature verification all untested for the new branches | Webhook delivery could fail silently or get dedup-blocked incorrectly | Send a synthetic `account.updated` payload with a valid `Stripe-Signature` header at the dev server, assert the partner row updated + `markEventProcessed` called exactly once |
| **`partner-stripe-card.tsx` PartnerStripeCard component** | Type-clean only; no runtime click-through | Onboarding URL redirect could fail; status pill could mis-render an enum the server returns | Playwright spec: open payouts tab, pick a partner, assert the card mounts + status pill matches the cached `getStatus` shape; click Onboard, assert redirect target |
| **5 Dialog components** (MarkPaid / MarkFailed / Retry / Cancel / ConfirmViaStripe) | Type-clean only — replaced `window.prompt` versions whose behavior IS proven, but the new Dialog wiring isn't | Submit-disabled-when-invalid could regress; auto-close on success could miss the mutation completing | Playwright spec per dialog: open from row action, type input, click submit, assert mutation fired + dialog closed |
| **`commissionCycle.{list, upsert, delete}` router procedures** | No test at all — server-side anchor-day validation untested | Range validation could regress + raw 23514 surfaces leak to UI | Bun integration test: upsert each cycle_type with invalid `anchorDay`, assert BAD_REQUEST with the expected message |
| **`commission-cycles.tsx` admin UI** | Type-clean only — never clicked | Form could fail to submit; branch picker could include branches with existing overrides | Playwright spec: navigate to the page, create a tenant-wide policy, create a branch override, delete the override, assert each step's DB state |
| **`partner-stripe-webhooks.service.ts` `transfer.created` recovery path** (idempotently marks paid when local row is stuck `pending`) | Tested for routing + state-machine guard, but NOT for the recovery branch | If operator's confirmViaStripe crashes mid-flight, the webhook should recover the row — recovery path could regress without this test catching it | Bun integration test: insert a pending payout with a `payoutId` in metadata, fire `handleTransferEvent("transfer.created", ...)`, assert row went `pending → paid` |
| **Bulk `confirmAllViaStripe` router** | Service has 4 integration tests; the oRPC handler that maps service errors to ORPCError codes is NOT tested | Caller would see generic 500s on partial failures instead of typed error rows | Integration test that hits the router handler (not the service directly) with a 50-row input, asserts the response shape includes `succeeded` + `failed` + per-row `errorCode` |
| **`runBatch` with `paymentMethod: "stripe_connect"` + `confirmImmediately: false`** | The path exists end-to-end but never exercised together — the iter 4 state-machine spec used `bank_transfer` | A regression here means non-cash batches never land at `pending` correctly | Integration test: call `runBatch({ paymentMethod: "stripe_connect", confirmImmediately: false })`, assert inserted payouts have `status='pending'` and linked splits stay at `approved` |
| **`lastStripeEventAt` schema column + service usage** | Drizzle schema fix is type-check only; the migration + service logic ran on the live DB but never under test | An out-of-order webhook could now use the wrong anchor; the F-SAAS-3 guard could mis-skip | Integration test: insert subscription row with `lastStripeEventAt = T0`, fire `markPastDue` twice — once with `event.created < T0` (should skip), once with `event.created > T0` (should apply); assert the skip + the advance |
| **`Item 1` partial unique index behavior on `commission_cycle_configs`** | Schema + migration exist; the partial unique indexes (one tenant-wide + one per branch) are CHECK'd by DB but never exercised by a test that tries to insert duplicates | A duplicate insert under concurrent admin edits could 23505 with a confusing message instead of being upserted | Integration test: concurrent `upsert` for same (`branchId=null`), assert one wins, other no-ops or returns the existing row |
| **`partnerStripe.createOnboardingUrl` router handler** | The HMAC service it calls IS unit-tested (`partner-stripe.service.test.ts` 11/11); the router-level checks — member active in this tenant, env vars present, URL params built — are NOT | A wrong/missing env (`STRIPE_CONNECT_CLIENT_ID`, `BETTER_AUTH_SECRET`) surfaces only at first prod use | Integration test: missing env → BAD_REQUEST or INTERNAL_SERVER_ERROR with the expected message; inactive member → BAD_REQUEST; happy path → returns a parseable `connect.stripe.com/oauth/authorize` URL with the signed state |
| **`partnerStripe.getStatus` router handler** | Shape is read by `PartnerStripeCard` + the card is consumed by the payouts tab — neither is runtime-tested, so the deterministic empty-state shape (when no row exists) has never been exercised | UI silently breaks when the operator picks a partner who has never been onboarded | Integration test: call `getStatus({ partnerId: <never-onboarded> })`, assert the deterministic empty shape (`connected: false` semantics via `stripeAccountId: null`); call again after a row exists, assert all fields populated |
| **`partnerStripe.confirmViaStripe` router-level error mapping** | `ConfirmPayoutError` → `ORPCError` code mapping (NOT_FOUND / BAD_REQUEST / BAD_GATEWAY) is in the router handler; the service tests assert the service-level errors but NOT the router-level oRPC code each maps to | Wrong oRPC code → UI shows the wrong error category, possibly with retry semantics that bypass the actual failure mode | Integration test through the router: trigger each `ConfirmPayoutError` variant (`PARTNER_NOT_ONBOARDED`, `BAD_REQUEST_STATUS`, `STRIPE_TRANSFER_FAILED` via stubbed Stripe), assert each maps to the documented oRPC code |
| **5 `markEventProcessed(eventId, cpDb)` call sites in `webhooks.routes.ts`** | These were pre-existing buggy calls using the wrong object-shape signature — Phase B's commit fixed all 5 in one sweep. The fix is type-check-only — no test confirms the dedup actually works for the new partner-branch webhook paths | A duplicate webhook delivery from Stripe could double-process (account.updated could re-fire side effects; transfer.created could fire a second `markPayoutPaid` recovery) | Integration test: fire the same `account.updated` event id twice through `handleAccountUpdatedForPartner`'s code path, assert second call is a no-op (the `claimWebhookEvent` / `markEventProcessed` pair short-circuits it) |

### Suggested batch order

Tier-by-tier preventative testing pass — ~3.5 days total, worth doing before any production rollout:

1. **Half-day** — F-11 / F-12 / F-19 integration tests (cheapest, finds easy regressions in the deep-spec's vacuous assertions).
2. **Half-day** — `commissionCycle` router (3 procedures + partial-unique-index concurrency) + admin UI Playwright. Item 1 has zero runtime exercise.
3. **One day** — Partner-Stripe OAuth callback + webhook route dispatcher (signature verification, `markEventProcessed` dedup) tests. Security-adjacent, deserve real proof.
4. **Half-day** — All four `partnerStripe.*` router handlers (`createOnboardingUrl`, `getStatus`, `confirmViaStripe` error mapping, `refresh`) — thin handlers but the env-var + ConfirmPayoutError → oRPC mapping is genuinely untested.
5. **Half-day** — Dialog components Playwright sweep (5 dialogs × open/submit/close = 15 cases).
6. **Half-day** — `lastStripeEventAt` ordering-guard integration test (F-SAAS-3 correctness gate for subscription lifecycle).

Past that, the long-tail items (transfer.created recovery branch, bulk router response shape, `runBatch` stripe_connect+confirmImmediately:false) can land alongside the Tier-1 work in items 1–5 of this brief.

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
