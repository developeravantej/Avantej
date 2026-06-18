# Session — 2026-06-05 13:12

**Branch:** test/unit-suite-green-and-ci-fix
**Working dir:** C:\Project\Avantej

## Goal
User reported "can't create" on the deployed app (https://avantej-core.developer-avantej.workers.dev/). Investigate via Chrome MCP and fix.

## What Was Done
- Reproduced in browser: customer create showed success toast, but directory stayed empty.
- Found `customerDirectory/list` + `getStats` returning HTTP 500 (masked as generic INTERNAL_SERVER_ERROR).
- Captured real error via `wrangler tail`: `Failed query … integer out of range`.
- Connected to live tenant DB; confirmed schema intact — bug was a JOIN fan-out inflating un-distinct `SUM(...)` past the `::INTEGER` cast.
- Fixed both queries in customer-directory.service.ts: decorrelated money sums into per-member scalar subqueries + `BIGINT` (parsed to number at mapping).
- Verified fixed queries against live tenant DB (sane numbers: 54 total, avg LTV RM 633.55).
- `bun check-types` passed; deployed `avantej-core-server` (version 4ef3cc14).
- Browser re-verified: endpoints 200, directory renders 52 customers.
- Investigated the "Ahmad Firdaus" create that didn't persist → was a test-data collision: stub phone +60123456789 is the logged-in Franchise Owner's own phone; `createUnclaimed` dedupes by phone and returned the existing owner record (200 + "created" toast). Create itself works (verified with a clean ZProbe row).
- Cleaned up ZProbe test customer (hard-deleted the 3 rows I created) and removed all diagnostic scripts.
- Committed the fix (db076f3e); amended message to remove a stray `@` from PowerShell here-string syntax used in the Bash tool.

## Files Touched
- `C:\Project\Avantej\packages\services\src\customer-directory.service.ts` — decorrelated SUM aggregates, INTEGER→BIGINT, Number() at mapping boundary (+35/−21)

## Commands Run
- `npx wrangler tail avantej-core-server --format json` — captured the real masked 500 (integer out of range)
- `bun run scripts/diag-*.ts` (temporary) — inspected tenant schema, ran exact queries, located root cause, cleanup (all deleted after)
- `bun check-types` — passed
- `npx wrangler deploy` — deployed server worker (version 4ef3cc14)
- `git commit` / `git commit --amend` — committed fix as db076f3e

## Decisions & Rationale
- Chose approach C (targeted decorrelation of only the SUM aggregates) over BIGINT-only (would mask wrong numbers) or full query rewrite (more churn). COUNT(DISTINCT)/MAX are fan-out-immune, left joined as-is.
- Used BIGINT for money sums as whale-tenant hardening despite per-member values being realistically small post-decorrelation.
- Did NOT commit unrelated pre-existing working-tree changes (.gitignore, _e2e/, zplan/, seed-e2e-staff.ts) — present at session start, not mine.

## Open Threads / Next Steps
- Commit `db076f3e` is local only — **not pushed**.
- Commit sits on `test/unit-suite-green-and-ci-fix` (unrelated branch) — may want to move to its own branch / PR.
- Optional UX follow-up: `createUnclaimed` dedupes by phone across ALL roles and still toasts "Customer profile created" when it reused an existing person — consider surfacing "this phone already belongs to X".

## Notes
- Real PG error behind a masked production 500 is reachable via `wrangler tail avantej-core-server --format json` (workers_tail scope present on the OAuth token).
- Tenant DB reachable locally: control-panel `DATABASE_URL` (from apps/server/.dev.vars) → `organizations.connectionString` → `decrypt()` → Neon serverless Pool.
- Org id 996febce-aaad-4ded-8f47-02d2b566c8ee; Tanjong Pagar node 8662e918-…; Franchise Owner phone = +60123456789 (the CLAUDE.md stub phone).
