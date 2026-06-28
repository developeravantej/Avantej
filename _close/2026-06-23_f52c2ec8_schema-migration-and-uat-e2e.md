# Schema comparison → migration pipeline → UAT-based e2e suite

- **Session id:** f52c2ec8-f1de-437e-8ee9-8afff054234d
- **Date:** 2026-06-23 13:30
- **Branch:** checkpoint-6-22 @ 723537e7
- **Status:** in-progress
- **/closing:** Overall 6/10 (A 9 · B 6 · C 9) — see closing-2026-06-23_13-09

## Scope
Started as "how does this Google-sheet schema differ from ours" → became: (1) the
client's existing data is being migrated INTO Avantej, so build a reusable
onboarding ETL; (2) re-base the e2e suite on the client's "Avantage Core MVP
Readiness & UAT Sign-Off" doc and produce a sign-off HTML (video + DB schema +
live data per section); (3) drive as many UAT sections to Ready as possible
without touching GoHighLevel.

## What was done
- **Migration pipeline** (`apps/server/scripts/migration/`): config-driven adapter
  → canonical DTOs → loaders → writer; 6 loaders (location→hierarchy, staff,
  product→services, client, appointment, branch-manager 2nd pass); xlsx adapter
  (fidelity-safe), source_system-aware crosswalk, dry-run engine, reconciliation.
  Committed + `--commit` loaded ~60 rows into the `test-fitness-franchise` tenant.
- **UAT e2e** (`_e2e/`): `uat-ledger.json` (every check item → spec + testability),
  `review-uat.html` (Go/No-Go: status + items + video + DB schema + live values,
  light theme), `dump-uat-data.ts`, `build-uat-review.mjs`, `build-migration-review.mjs`.
  New specs: §5 booking credit invariants + 24h reschedule/cancel lock, §8
  delete-guard, §11 multi-location, §3/4 client-portal + password-reset, §13
  RBAC + filters + CSV export, §12 commission output integrity, §2 registration
  form, §6 calendar Avantej-side, migration data verification.
- **Production change**: §5 24h booking lock enforced server-side
  (`appointments/lock.ts` shared helper; admin override); §8 deleteNode → typed 409.
- **Tooling/docs**: `_e2e/shard-run.sh` (restart-per-shard runner, persistent-server
  default), `zplan/sheet-schema-gap/` (GAP + migration strategy + decisions),
  `_future/legacy-onboarding-migration-pipeline.md` + `_future/uat-e2e-remaining-coverage.md`.

## Files changed
89 files changed, 9987 insertions(+), 430 deletions(-) (79573072~1..HEAD)
— mostly `_e2e/`, `apps/server/scripts/migration/`, `packages/api/src/routers/appointments/`,
`zplan/sheet-schema-gap/`, `_future/`.

## Commits
- 723537e7 docs(_close): /closing re-rate
- a2d31bdb fix(appointments): close /closing gaps — cancel-lock test, shared lock helper, deleteNode 409
- 0f821915 docs(_future): UAT e2e remaining-coverage brief
- 44375554 test(e2e): cover non-GHL UAT items — report export, registration form, password reset
- 59cf9586 / de3a6c05 test(e2e): shard runner
- 2dcb62ec @ checkpoint: deploy to ZHIYUAN cloudflare account (swept in §12 work)
- 437d87f7 feat(appointments): enforce UAT §5 24h lock
- d52d6c9b feat(e2e): UAT sign-off page + gap coverage
- 79573072 feat(migration+e2e): legacy onboarding ETL pipeline + UAT e2e
(all pushed: 2dcb62ec..723537e7 → origin/checkpoint-6-22)

## Commands run
- `bun run scripts/migration/engine/run.ts --commit` → migration data loaded to test tenant
- `bunx playwright test … web/booking` → 4/4 pass (credit invariants + 24h lock)
- per-section playwright runs (§8/§9/§11/§12/§13/§3-4/§6/§2) → green in batches
- `bun check-types` → clean (migration + appointments changes)
- `git push` → 2dcb62ec..723537e7 checkpoint-6-22

## Decisions
- Migration = onboarding capability (per-client manifest), not one-off; adapter/
  loader/writer seams for volume + tenant scaling. Read .xlsx directly (exceljs)
  for NRIC/phone/date fidelity. One crosswalk namespace per client run.
- e2e verified at the API boundary (rpc) — reliable but low video; UI journeys
  (migration) carry video.
- §5 24h lock: enforce for non-admins, admin override (doc-stated rule).
- Committed migration data to the dev tenant (user-approved) — not self-cleaning.

## Open threads
- **B (e2e+video) env-gated**: no single clean full-suite green run + per-journey
  video in this sandbox (dev-server wedge + turbo-restart flakiness). Run
  `bash _e2e/shard-run.sh` on a stable env → rebuild review. (closing plan #2)
- **Migration blocked loaders** (sales/package/redemption): client must re-export
  (CL-xxx ↔ blank client_id key mismatch; blank package product_id), provide
  historical commission amounts, multi-currency hardening, new `coach_session_claims`
  table. See `_future/legacy-onboarding-migration-pipeline.md`.
- **UAT Partials** need unbuilt features / external creds / heavy fixtures: §2 PDF
  sign + payment-proof upload, §3 invoice PDF, §7 file upload, §12 incentive/renewal
  calc, §6 Google OAuth, §1/§10 GHL. See `_future/uat-e2e-remaining-coverage.md`.
- Fix plan: `_close/closing-2026-06-23_13-09_uat-e2e-and-migration.md`.
- Dev-tenant teardown (keyed on mig_xwalk) — optional, accepted.
