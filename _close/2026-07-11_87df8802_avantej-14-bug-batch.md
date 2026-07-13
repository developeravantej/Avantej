# AVANTEJ 14-bug batch + follow-ups + closing gate

- **Session id:** 87df8802-28a9-45b3-9e68-bde4f2c6d77d
- **Date:** 2026-07-11 10:45
- **Branch:** wilfred/avantej-16-opening-hours @ efae524e (stacked on wilfred/avantej-followups → wilfred/avantej-bugfix-batch → main)
- **Status:** in-progress
- **/closing:** Overall 6/10 (A 7 · B 6 · C 8) — NEEDS WORK (trajectory 3 → 5 → 6)

## Scope
Connect Linear (read+write), triage the AVANTEJ team, then fix **every** open AVANTEJ issue end-to-end following a self-authored rule (assign → In Progress → reproduce → fix → prove → close). Then resolve the follow-ups those fixes spawned, and run the `/closing` quality gate + remediate its blockers.

## What was done
- **Linear:** connected the MCP; established `_rules/working-with-linear/` workflow rule + reusable `_e2e/` proof harness (API-only global-setup, config template, `proof-capture.mjs`); added a "check for a rule first" note to CLAUDE.md.
- **10 original bugs fixed & closed** (PR #81): AVANTEJ-9 refund double-count (`refunds.service.ts` — refund ≠ cancellation), AVANTEJ-8 report trailing windows (`ReportsPage.tsx`), AVANTEJ-7 active-members = customers (`analytics.service.ts`), AVANTEJ-14 branch counter subtree rollup (`hierarchy.service.ts`), AVANTEJ-11 Add-Customer CSS, AVANTEJ-6 appointment duration (`useAppointmentFormData.ts`), AVANTEJ-12 refund list refresh, AVANTEJ-13 delete tooltip, AVANTEJ-5 appointment visibility (trainerId backfill + serviceId thread + appointment_clients), AVANTEJ-10 UI-freeze perf (bounded dropdowns + customer filter).
- **3 follow-ups** (PR #82): AVANTEJ-18 trustedOrigins comma-split, AVANTEJ-17 class-slots list-key, AVANTEJ-15 form-booking credit deduction. **4 new follow-up tickets filed** (AVANTEJ-15/16/17/18).
- **AVANTEJ-16 opening-hours feature** (PR #83): jsonb column + migration 0105 + service/API + read panel + new `OpeningHoursEditor`.
- **`/closing` gate caught a real shipped bug:** AVANTEJ-15 was a silent no-op (`packageInstanceId` vs `id`) → fixed; AVANTEJ-9 guard dead-fallback → hardened; added AVANTEJ-18/8 unit tests + AVANTEJ-14 rollup proof; made `avantej16-proof` non-destructive.
- **Incidental:** gated `crossSubDomainCookies` on `isHttps` (local login/e2e); fixed 2 CI Type-Check implicit-any errors; extracted `corsOriginsFromEnv` + `trailingKpiRange` pure helpers.

## Files changed
44 files, +1400/−75 (vs main). Key: `packages/services/src/{refunds,analytics,hierarchy,appointment,recurrence}.service.ts`, `packages/db/src/schema/tenant/branch-details.ts` + migration `0105_branch_opening_hours.sql`, `packages/api/src/routers/{hierarchy/update,appointments/list}.procedures.ts`, `apps/server/src/lib/better-auth.ts`, ~14 `apps/web/src/**` files (reports, branch, class-slots, refunds, appointments, customers), `_rules/working-with-linear/`, `_e2e/**` (specs + proof scripts).

## Commits
```
efae524e test(avantej): add executable regression guards (closing gate B)
5294971e fix(avantej): closing-gate fixes — AVANTEJ-15 no-op, AVANTEJ-9 guard, AVANTEJ-18 test
81ea058f feat(avantej): AVANTEJ-16 per-branch opening hours (persist + read + editor)
6d6a0798 fix(avantej): resolve 3 follow-up tickets (auth origins, list refresh, credits)
9aae36ca fix(types): annotate implicit-any params flagged by CI Type Check
b35be1b1 docs(rules): reusable Linear proof harness + realistic proof standard
4b43468e fix(avantej): resolve 10 AVANTEJ bug tickets (POS, reports, appointments, perf)
```
PRs: **#81** (10 fixes → main), **#82** (follow-ups → #81), **#83** (AVANTEJ-16 → #82).

## Commands run
- `bun check-types` → clean for changed files (pre-existing untracked receipt-print/billing noise excluded).
- `bun test src/tests/unit/lib/cors-origins.test.ts` → 5/5 pass (AVANTEJ-18).
- `bun run test src/__tests__/pages/reports-kpi-range.test.ts` → 6/6 pass (AVANTEJ-8).
- `analytics.test.ts` (AVANTEJ-7 mock updated) + `appointment.service.test.ts` → green.
- `node _e2e/avantej{5,14,16}-proof.mjs` (live stack :3020/:3022) → all **PASS** (14: 0 rollup violations, root=29).
- `bunx playwright test --config _e2e/playwright.avantej9.config.ts` (AVANTEJ-9) → pass + recorded video.
- `migrate-all-tenants.ts --filter=test-fitness-franchi` → applied 0105 to dev tenant.
- Pushed all 3 branches; opened PRs #81/#82/#83.

## Decisions
- **Refund ≠ cancellation** (AVANTEJ-9): a full refund no longer flips order status to `cancelled`; tracked via `refundStatus`/`refundedAmountCents`. Consequence: fully-refunded sales drop off the Cancelled-Sales tab (flagged to user).
- **AVANTEJ-16 built** (not deferred) after user confirmation — simple per-day open/close + Closed toggle editor.
- **Proof standard** relaxed in the rule: e2e assertion + video **or** screenshot (Radix `<Select>` can't be driven headlessly, so mutation flows use the `/rpc` API boundary).
- Kept concurrent sessions' untracked work (receipt/billing) out of all commits; regenerated the tenant-migrations module without their untracked `0100_billing_documents.sql`.
- Stacked PRs (not one) to keep review scoped; merge order #81 → #82 → #83.

## Open threads
- **CI:** `drift-check` red on all 3 PRs — **pre-existing infra** (`gen-erd.ts` can't decrypt tenant conns; CI `ENCRYPTION_KEY` mismatch), not this code. All other checks green (Type Check fixed via 9aae36ca).
- **`/closing` remainder → 6/10** (see `_close/closing-2026-07-11_02-45_avantej-14-bug-batch.md`): executable guards still missing for AVANTEJ-6/7/12/17 (automatable) + component tests for 11/13; net-collected & avantej5 proof scripts lack teardown; MEDIUM edge-cases open — AVANTEJ-16 hours zod validation (open>close), AVANTEJ-7 scoped comped-customer undercount, AVANTEJ-5/10 profile tab misses class attendees; LOW — AVANTEJ-15 multi-package soonest-expiry, `(typeof x)[number]` workaround.
- **Not merged / not committed to main.** `apps/server/.dev.vars` (gitignored) left at `CORS_ORIGIN=http://localhost:3022`. Dev servers stopped.
- **AVANTEJ-16 prod rollout:** run `migrate-all-tenants.ts` for 0105 on production tenants before/with merge.
