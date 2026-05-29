# Future-Work Omnibus Plan

**Created:** 2026-05-29
**Branch base:** `audit-prove-a/commission-installment-20260527-1700` (PR #32) / `main`
**Sources:** `_future/*.md` + `_summary/*.md`

This plan sequences every outstanding item from the `_future/` briefs into executable phases, ordered so that the production-blocking work lands first. Each phase lists user journeys, file ownership, risks, and verification.

---

## Phase 0 — FIX THE INTEGRATION SUITE (blocks Item 7 and everything downstream)

### Root cause (confirmed 2026-05-29)
`apps/server/src/tests/helpers/integration-setup.ts:createTenantDb()` / `createControlPanelDb()` create a Neon WebSocket `Pool` but return only the Drizzle client. The pool handle is unreachable, so it is never `.end()`ed. **44 of 45** integration files use these helpers. Running the full directory in one Bun process leaks ~44 open WebSocket pools → the process never exits → "long no-output stretches → killed."

Secondary: tests use bare `test()` not `test.skipIf(SKIP)`; under `SKIP_INTEGRATION_TESTS=true`, `beforeAll` returns early but test bodies still run against an undefined `tenantDb`. No bun preload / global teardown exists.

### Fix (least-churn: pool registry + global teardown)
1. In `integration-setup.ts`: maintain a module-level `const openPools: Pool[] = []`; push every pool created by `createTenantDb`/`createControlPanelDb`. Export `closeAllTestPools(): Promise<void>` that `await`s `pool.end()` for each and clears the array.
2. Add `apps/server/src/tests/preload.ts` that registers a global `afterAll(closeAllTestPools)`.
3. Wire preload in `apps/server/bunfig.toml`:
   ```toml
   [test]
   preload = ["./src/tests/preload.ts"]
   ```
4. Fix `package.json` `test:integration` glob — it currently matches only `*.integration.test.ts`, missing ~30 integration files that live in `tests/integration/` without that suffix (`refund-state-machine.test.ts`, `commission-approve-invariants.test.ts`, etc.). Change to `bun test src/tests/integration/` (whole dir) OR rename files for consistency. **Decision needed: rename vs glob-widen** (rename is cleaner long-term; glob-widen is zero-risk now).
5. Optional hardening: add a `describeIntegration` helper that wraps `describe.skipIf(shouldSkipIntegration())` so skipped runs don't execute bodies against undefined DBs.

### Verification
- `cd apps/server && bun test src/tests/integration/` **completes and the process exits on its own** (no kill needed). This is the pass condition.
- Re-run twice; confirm consistent exit + stable pass/fail counts.
- Record the real pass/fail/skip numbers — the summaries' "26 pass / 0 fail" claim was already shown overstated by 3 (hook-timeout flakes in `refund-target-priority.test.ts`). Triage those 3 flaky hooks separately.

**Effort:** ~half-day. **Owner:** one backend/test agent. Files: `integration-setup.ts`, new `preload.ts`, `bunfig.toml`, `package.json`.

---

## Phase 1 — Item 7 verification batch (NOT optional before prod)
Depends on Phase 0 (suite must run to completion first).

5 integration tests (~2 hrs) from `_future/audit-prove-a-commission-installment-orchestration-followups.md` Item 7:
1. Re-run full integration suite to a clean exit (Phase 0 enables this) and record the true baseline.
2. **F-INS-2** — POS a 1-installment sale → assert `audit_log` has `action='installment.paid'` AND package_instance flips completed via `markCompleteIfFinal`.
3. **F-SAAS-3** — fire `markPastDue` twice; 2nd event with `event.created < lastStripeEventAt` is a no-op (webhook replay safety).
4. **F-PAY-3** — `markPaidBatch` → assert a `payouts` row created + `audit_log` `payout.create` entry.
5. **F-COM-C** — partial-line refund on a 2-line / 2-trainer sale → reversal is proportional, not full.

**Verification:** all 5 green in the now-stable suite. **Owner:** test-engineer. **Effort:** ~2 hrs.

---

## Phase 2 — §0 testing-gaps closure (pre-prod hardening, ~3.5 days)
From `_future/audit-prove-commission-followups.md` §0 (20 type-check-only surfaces). Batch order per the brief:
1. **½ day** — F-11 / F-12 / F-19 integration tests (boundary-timestamp seeds; current assertions are vacuous).
2. **½ day** — `commissionCycle.{list,upsert,delete}` router + partial-unique-index concurrency + admin-UI Playwright.
3. **1 day** — Partner-Stripe OAuth callback + webhook route dispatcher (`markEventProcessed` dedup, signature verification). Security-adjacent.
4. **½ day** — 4 `partnerStripe.*` router handlers (`createOnboardingUrl`, `getStatus`, `confirmViaStripe` error mapping, `refresh`).
5. **½ day** — 5 Dialog components Playwright sweep (open/submit/close × MarkPaid/MarkFailed/Retry/Cancel/ConfirmViaStripe).
6. **½ day** — `lastStripeEventAt` ordering-guard integration test.

**Owner:** 2 test-engineers in parallel (disjoint: backend integration vs Playwright UI). **Verification:** each surface has a runtime assertion; suite stays green + exits clean.

---

## Phase 3 — Polish items (one combined PR, sub-1-hr each)
From orchestration-followups #1–6:
- Promote `subscriptions.last_stripe_event_at` to NOT NULL after prod null-check `SELECT count(*) ... WHERE last_stripe_event_at IS NULL`; drop the `?? updatedAt` fallback in `markPastDue`/`markActive`. (control-panel migration)
- Restore `installment_management` permission resource: add to `Resource`/`Action` unions in `permission.service.ts` + seeds (`seed-rbac.ts`, `permissions.seed.ts`) + grant migration; swap the 7 installment mutations off `service_management:update`.
- Fix Stripe SDK `never`-narrowing in `confirm-payout-via-stripe.service.ts:277-284`.
- Delete unused `TEST_USER_ID` import in `installments.integration.test.ts:23`.
- Delete stray `oxlint-output.txt`; add `*oxlint-output.txt*` to `.gitignore`.
- Re-record `gap-prove-commission-installment` with seeded fixtures (needs `seedCommissionSplit` + `seedPendingPayout` helpers in `e2e/helpers/seed-data.ts`).

**Owner:** 1 backend agent. **Verification:** `bun check-types` green; permission swap tested as non-admin-with-grant.

---

## Phase 4 — Open decisions (require human/product input — surface, don't auto-build)
From `_future/audit-prove-a-followups.md`:
- **CPR-04** — Commission reversal timing policy. **BLOCKER: finance/product must choose** reverse-at-intent vs reverse-at-disbursement in writing. Then build `unreverseForRefund` + `charge.refund.updated` webhook branch. 1–2 days after decision.
- **AC-A-06** — Invitation token hash-at-rest. Security migration (both `invitations` control-panel + `branch_invites` tenant): add `token_hash`, dual-write, lookup-by-hash, backfill, then drop plaintext in a later deploy. 2–3 days.
- **PO-005** — POS "Online" → Stripe Checkout Session + webhook + email/SMS dispatch. Feature build, 3–5 days. Reference template: `payments.sendPaymentLink`.

**Action this phase:** open a decision ticket for CPR-04; scope AC-A-06 + PO-005 into their own plans. Do not implement until decisions land.

---

## Phase 5 — Feature builds (each its own planning + execution session)
| Feature | Brief | Effort | Notes |
|---|---|---|---|
| Per-line commission refund (`salesOrderItemId` FK) | `commission-splits-per-line-refund.md` | 3–5 d | Tenant migration + calculator plumbing + reversal path + backfill script; legacy NULL-fk rows fall back to proportional |
| Announcements read-receipts | `announcements-read-receipts.md` | 3–5 d | 2 tenant tables + member-facing UI + aggregate (≤2 SQL, no N+1) |
| NPS module | `nps-module.md` | 5–7 d | Mobile collects / web aggregates; restore Reports tile to `xl:grid-cols-6`; needs mobile-team ship window |
| Internal messaging | `messaging-system.md` | 2+ wk | Build last; powers the disabled customer "Send message" button |

**Sequencing:** per-line refund first (correctness/finance), then announcements, NPS, messaging.

---

## Phase 6 — Commission-engine long tail
From `_future/audit-prove-commission-followups.md` items #1–9:
- **Tier 1 (blocked/large):** Stripe Accounts v2 migration (when MY market opens — external blocker); tenant-timezone cycle bounds (UTC-only today, needs `organizations.timezone`); per-partner Stripe detail page; e2e operator flow vs Stripe test-mode; live-Stripe CI gate.
- **Tier 2:** P3 omnibus (8 small fixes — N+1s in `getConfigsMissingRateForTier` + `voidCommissionSplitsForSalesOrder`, `markPaidBatch` reconciliation key, 2 orphan exports, NaN guard, silent LIMIT 500, `configVersionId` snapshot) — one PR; bulk `markPaid`/`cancel` parity with `confirmAllViaStripe`; cycle policy audit history table.
- **Tier 3:** audit-prove the next domains (customer-profiles → package-instances → inventory → scheduling → expenses → notifications).

---

## Recommended execution order
1. **Phase 0** (suite fix) — unblocks everything; do immediately.
2. **Phase 1** (Item 7) — mandatory before any prod rollout of PR #32.
3. **Phase 3** (polish) — cheap, lands check-types-green wins.
4. **Phase 2** (§0 gaps) — pre-prod hardening.
5. **Phase 4** (decisions) — start the CPR-04 conversation in parallel with the above.
6. **Phase 5 / 6** — feature + long-tail, scheduled per capacity.

## Cross-cutting risks
- Parallel-agent writes on shared files (`payouts-tab.tsx`, `features/payouts/api.ts`, partner-stripe service) caused repeated reverts in prior sessions — designate single owners, commit often.
- Schema phases (Phase 3 NOT NULL, Phase 5 FK, Phase 6 timezone) must run `bun verify:migrations` + `bun scripts/check-drift.ts` before PR.
- Tenant migrations must be idempotent + regenerate `tenant-migrations.generated.ts`.
