# Audit-Prove -a · Commission + Installment Orchestration — Future Work

## Status (2026-05-28)

The human-gated orchestration of `zplan/2026-05-27-1700-audit-prove-a-commission-installment/` re-verified all 16 audit findings + cleared all 3 follow-up handoff prompts. Net new commit from the orchestration pass: `4ec578f4 fix(saas): F-SAAS-3 canonical fix — use lastStripeEventAt anchor in markPastDue/markActive`. PR #32 is review-ready.

This file lists items the orchestration surfaced but did NOT address — small enough that they didn't warrant a fix wave, but worth tracking so they don't get lost. Anything substantive is already covered in `audit-prove-commission-followups.md` (testing gaps) and `commission-splits-per-line-refund.md` (F-COM-C schema work).

Source-of-truth references:
- `zplan/2026-05-27-1700-audit-prove-a-commission-installment/REPORT.md`
- PR #32 conversation: https://github.com/ZHIYUAN-TECHNOLOGY/avantej-core/pull/32

---

## 1. Promote `subscriptions.last_stripe_event_at` to NOT NULL

### Problem
Migration `0032_subscriptions_last_stripe_event_at.sql` adds the column nullable + backfills from `updated_at` for existing rows. Every Stripe-driven write since then sets it explicitly. The fallback path in `markPastDue` / `markActive` (`existing.lastStripeEventAt ?? existing.updatedAt`) only exists to handle legacy rows that the backfill might have missed.

### Why deferred
The handoff prompt for #1 explicitly noted: *"Adding NOT NULL later is a separate follow-up if desired."* The decision needs a one-off verification query on prod:

```sql
SELECT count(*) FROM subscriptions WHERE last_stripe_event_at IS NULL;
```

If zero, the column can be promoted to NOT NULL and the `?? updatedAt` fallback removed. If non-zero, those rows need a targeted backfill before the promotion.

### Effort
**~1 day.** Migration + verification query in prod + cleanup of the fallback expression in both `markPastDue` and `markActive`. Worth bundling with the next control-panel migration so it doesn't ship alone.

---

## 2. Restore `installment_management` permission resource

### Problem
Finding F-INS-4 swapped 7 installment-router mutations from `if (member.role !== "admin") throw` to `requirePermissionOrpc(..., "service_management", "update")`. The fix is correct semantically — installment mutations DO mutate package/service state — but the resource name is a workaround. The audit explicitly suggested `installment_management:write`, which was unavailable because that resource doesn't exist in the `Resource` union in `packages/services/src/permission.service.ts`.

### Why deferred
Adding a new resource is a multi-file change:
1. `Resource` + `Action` unions in `permission.service.ts`
2. Seed entries in `packages/db/src/seed-rbac.ts` and `packages/db/src/seeds/permissions.seed.ts`
3. Default role grants (admin gets everything; staff gets a subset?)
4. UI: the access-control permissions page maps resources to displayable strings

Doing this in the orchestration pass would have pulled in test data + RBAC seed work outside the audit's scope.

### Effort
**~1 day.** Add resource + actions + seeds + a small migration to grant the new permissions to existing admin roles (so the swap doesn't lock anyone out). Then update the 7 installment procedures to use `installment_management:update` (or `:write` — match the convention used elsewhere).

---

## 3. Resolve the pre-existing TS7028 in `confirm-payout-via-stripe.service.ts`

### Problem
`apps/server/src/services/confirm-payout-via-stripe.service.ts:277-284` (8 lines) reports `error TS2339: Property 'failureMessage' does not exist on type 'never'` and 6 sibling errors on `stripeErrorCode`, `stripeErrorType`, `destinationAccountId`, `amountCents`, `currency`. These errors appear when `@avantej-core/db`'s dist is in sync (after a fresh build); they disappear when the dist is stale (turbo cache).

### Why deferred
The errors are a real type-narrowing issue (Stripe SDK union types resolving to `never` after a guard), not a stale-cache symptom. Fixing them requires either:
- An explicit non-null assertion + cast on the narrowed value, OR
- Restructuring the conditional so TypeScript can preserve the type through the branch

Either way it's surgical and doesn't block CI in practice — `bun check-types` reports green when run against fresh dists.

### Effort
**~30 minutes.** Read the conditional, add the right narrowing or cast, verify the runtime behavior is unchanged.

---

## 4. Drop the unused `TEST_USER_ID` import in `installments.integration.test.ts`

### Problem
`apps/server/src/tests/integration/installments.integration.test.ts:23` imports `TEST_USER_ID` but never uses it. The variable was probably leftover from a recent refactor.

### Why deferred
Pure cleanup, no test or runtime impact. Surfaced as a `TS6133` error in the orchestration's type-check pass after the db rebuild.

### Effort
**~1 minute.** Delete the import.

---

## 5. Re-record `gap-prove-commission-installment` with seeded fixtures

### Problem
The session's gap-prove harness `e2e/gap-prove-commission-installment.spec.ts` has two assertions that are currently inconclusive because the tenant-admin storage state has no matching seed data:

- **F-COM-A** — `getMyCommissions` returns 0 because no `commission_splits.staffId == tenant-admin's userId` rows exist.
- **F-PAY-6** — Payouts tab row-action menu doesn't render because there are no payout rows for tenant-admin.

The code fixes for both are correct (verified by direct reading), but the harness can't BROWSER-PROVE them without fixtures.

### Why deferred
Seeding requires either:
- Running the same flow that creates a real commission_split / payout (an admin completes an appointment, then runs a payout batch), OR
- Adding seed-data helpers that bypass the production flow

Either approach adds maintenance burden to the harness and was out of scope for the orchestration's verification mission.

### Effort
**~half-day.** Extend `e2e/helpers/seed-data.ts` with `seedCommissionSplit({ staffId })` + `seedPendingPayout({ recipientId })` helpers that insert rows via the same oRPC pipeline that creates them in production. Then update the spec to seed → assert → cleanup.

---

## 6. Clean up the stray `oxlint-output.txt` temp file

### Problem
A weirdly-encoded untracked file sits at the repo root:
```
"C\357\200\272UsersuserAppDataLocalTempoxlint-output.txt"
```
That's a Windows TEMP path that got literally interpreted as a Linux-style filename, probably by a hook running through Git Bash with mangled `$TMPDIR`. It survives `git status` cycles because the gitignore doesn't match its exact form.

### Why deferred
It's not in any code path. Likely a one-off byproduct of a tool run.

### Effort
**~30 seconds.** `rm` the file. Optionally add `*oxlint-output.txt*` to `.gitignore` so a future re-occurrence doesn't drift back in.

---

## Sequencing recommendation

If picked up as a single cleanup pass, the order that minimizes context switches:

1. (6) Delete the temp file — trivial
2. (4) Drop the unused import — trivial
3. (3) Fix the Stripe SDK narrowing — small, lands `bun check-types` green even on the strictest path
4. (1) `lastStripeEventAt` NOT NULL promotion — single migration + small service cleanup
5. (2) `installment_management` permission resource — multi-file but contained
6. (5) Seeded gap-prove re-record — biggest item, do last when the rest of the branch is settled

Items 1–4 are sub-1-hour each and could land in a single "polish" commit. Items 5–6 deserve their own commits with clear before/after rationale.
