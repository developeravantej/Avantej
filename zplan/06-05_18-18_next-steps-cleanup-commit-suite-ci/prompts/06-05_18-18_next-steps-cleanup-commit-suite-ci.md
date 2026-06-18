# Next Steps: Repo Cleanup → Commit E2E Suite → Unit Suite Green + CI → Customer-500 Follow-up

> Handoff prompt generated 2026-06-05 · Branch: test/unit-suite-green-and-ci-fix · Project: Avantej

## Mission

Execute four sequenced cleanup/stabilization tasks on the `test/unit-suite-green-and-ci-fix` branch: (1) delete stray junk files from the repo root, (2) commit the new `_e2e/` review suite + the E2E staff seed script with a correct `.gitignore`, (3) get the unit test suite green and fix CI, (4) verify the customer-directory 500 fix and add regression coverage. Done = repo root is clean, the E2E suite is committed (artifacts gitignored), `bun check-types` + unit suites pass, CI is green, and the directory 500 has a regression test.

## Context

**Project:** Avantej — multi-tenant gym/fitness SaaS (Turborepo monorepo). Vite + TanStack Router + Better-Auth + oRPC + Drizzle; per-tenant Neon DB branches.
**Stack (relevant here):** Bun workspaces, `turbo`, oxlint (`bun check`), `tsc -b` via `turbo check-types`, Bun test (server) + Vitest (web), Playwright E2E under `_e2e/`.
**Branch:** `test/unit-suite-green-and-ci-fix`
**Recent work:**
- `db076f3e fix(customers): stop directory list/stats 500 from JOIN fan-out overflow` — the directory-500 fix (task 4 verifies this).
- `f520eb27 fix(api): allow org-wide (null branchId) service categories & services`
- Prior session built the `_e2e/` review suite (88 specs, review.html) — currently all untracked.

## Current State

- **Repo root has two stray junk files** (mangled absolute-path names from a prior path-resolution bug, created May 30):
  - `C:ProjectAvantejzplan05-30_16-58_post-approval-schedulinggapsscalability.md` (7 KB)
  - `C:UsersuserAppDataLocalTempoxlint-output.txt` (78 KB)
  These are accidental files literally named with the colon/path baked into the filename. Pure junk.
- **`.gitignore` is modified (unstaged)** — already adds `_e2e/.auth/`, `_e2e/results/`, `_e2e/run-logs/`, `_e2e/videos/`. It does NOT yet ignore `_e2e/loop/evidence/`, `_e2e/**/*.log`, `_e2e/run-*.txt`, or shard/parts artifacts. Note: file currently has no trailing newline + an LF→CRLF warning.
- **`_e2e/` is untracked** — contains the committable suite (specs, journeys, strategy, review.html, playwright.config.ts, config.json) plus gitignored artifacts (results/ videos, .auth/ sessions). `report.json` (111 specs) + `review.html` (108/108 videos resolve) are freshly regenerated and consistent.
- **`apps/server/scripts/seed-e2e-staff.ts` is untracked** — provisions the deterministic E2E staff user the suite's multi-role auth depends on. Should be committed.
- **Unit suite:** per project memory, `bun test:unit` (server) has 0 *real* failures, but the combined run fails ~5 tests due to Bun `mock.module` process-global pollution. `bun run test:unit:isolated` (per-file process isolation, `apps/server/scripts/run-integration-isolated.ts`) is the green path. The exact CI failure on this branch is unconfirmed — investigate first.
- **Other untracked:** `zplan/06-03_21-47_integration-process-isolation/`, `zsession/…`, and this handoff folder — leave as-is (not part of these tasks).

## Scope

**In scope:**
- Repo-root junk file deletion (the two `C:…` files only).
- `.gitignore` (extend E2E ignore block).
- Committing `_e2e/` (specs/journeys/strategy/review.html/config) + `apps/server/scripts/seed-e2e-staff.ts`.
- `apps/server/` unit test suite + `run-integration-isolated.ts` runner; CI workflows under `.github/workflows/` (esp. `ci.yml`, `integration.yml`).
- `apps/server/src/routers/**` customer-directory list/stats + a regression test for the 500 fix.

**Out of scope (do not touch):**
- `~/.claude/skills/e2e-deep/` — the skill itself is validated and done; no changes.
- `_e2e/results/`, `_e2e/.auth/`, `_e2e/videos/` — gitignored artifacts; never `git add` them.
- `routeTree.gen.ts` (auto-generated).
- Tenant schema / migrations — no schema changes here.
- The other untracked `zplan/`/`zsession/` folders.
- Do NOT run `git stash`/`git reset` (CLAUDE.md hard rule).

## Tasks

1. Delete the two stray junk files at repo root: `C:ProjectAvantejzplan05-30_16-58_post-approval-schedulinggapsscalability.md` and `C:UsersuserAppDataLocalTempoxlint-output.txt` (quote the paths; the `:` is literal in the filename).
2. Extend `.gitignore`'s E2E block to also ignore `_e2e/loop/evidence/`, `_e2e/loop/server.json`, `_e2e/**/*.log`, `_e2e/run-*.txt`, `_e2e/devserver.log`, `_e2e/devweb.log`, `_e2e/results/report-*.json`, `_e2e/results/shard-*.log`, `_e2e/*-parts/`; fix the missing trailing newline.
3. Stage the committable E2E suite only — `git add _e2e/` then verify with `git status` that NO `results/`, `.auth/`, or `videos/` files are staged; also `git add apps/server/scripts/seed-e2e-staff.ts` and `.gitignore`. Commit as `chore(e2e): add module-grouped review suite + e2e staff seed`.
4. Investigate the actual CI/unit failure: run `cd apps/server && bun test:unit` and capture which tests fail and why; compare against `bun run test:unit:isolated`.
5. Make the unit suite green in CI — wire `ci.yml`/`integration.yml` to use the per-file isolated runner (`run-integration-isolated.ts`) for the suites that suffer `mock.module` pollution, OR fix the specific mock collisions; do not weaken assertions to force green.
6. Run the full gate locally and resolve failures: `bun check-types`, `bun check` (oxlint), `cd apps/web && bun test`, `cd apps/server && bun run test:unit:isolated`.
7. Add a regression test for the directory-500 fix (commit `db076f3e`): assert customer-directory list + stats return 200 (not 500) for an org whose data would previously fan-out/overflow the JOIN; place it with the server tests (`apps/server/src/tests/`).
8. Commit the unit/CI fixes and the regression test as a separate commit; report the final `check-types` + test + CI status.

## Verification

- [ ] `git status` shows the two `C:…` junk files gone and no stray artifacts in the E2E commit (no `results/`, `.auth/`, `videos/`).
- [ ] `git show --stat HEAD~1` (the E2E commit) lists specs/journeys/strategy/review.html/config + `seed-e2e-staff.ts` only.
- [ ] `bun check-types` → 0 errors.
- [ ] `bun check` (oxlint) → clean.
- [ ] `cd apps/server && bun run test:unit:isolated` → all pass; combined `bun test:unit` failures are understood/resolved.
- [ ] `cd apps/web && bun test` → pass.
- [ ] CI on the branch is green (push and confirm `ci.yml` + `integration.yml` pass).
- [ ] New regression test exercises the directory list/stats path and asserts 200; it fails when `db076f3e` is reverted.

## Key References

| Resource | Path / Command |
|----------|---------------|
| Directory-500 fix commit | `git show db076f3e` |
| Server unit tests | `cd apps/server && bun test:unit` |
| Isolated unit runner | `cd apps/server && bun run test:unit:isolated` (`apps/server/scripts/run-integration-isolated.ts`) |
| Web tests | `cd apps/web && bun test` |
| Type check | `bun check-types` |
| Lint | `bun check` |
| CI workflows | `.github/workflows/{ci,integration}.yml` |
| E2E suite + seed | `_e2e/` · `apps/server/scripts/seed-e2e-staff.ts` |
| Test layout (centralized) | `apps/server/src/tests/` (NOT co-located) |

## Constraints

- Never `git add` `_e2e/results/`, `_e2e/.auth/`, or `_e2e/videos/` — gitignored artifacts (videos are large + regenerable).
- Do not modify `routeTree.gen.ts` or tenant schemas/migrations.
- Do not weaken or skip tests to force green — fix the root cause (mock isolation), don't paper over.
- oRPC for all client→server calls; Drizzle (no Convex); Better-Auth (no Clerk) — don't introduce off-stack patterns.
- Commit only when each logical unit is done; branch first only if not already on a feature branch (you are on `test/unit-suite-green-and-ci-fix`).
- No `git stash` / `git reset` (any variant).
- Bun `mock.module` is process-global (first-factory-wins per specifier) — combined runs collide; isolation is the real fix, not wider mock supersets.

## Agent Recommendation

**Suggested agent:** backend-engineer
**Why:** The substantive work (server unit-test isolation, CI wiring, oRPC directory-500 regression test) is backend/test-infra; the cleanup + commit steps are mechanical and fit the same agent.
