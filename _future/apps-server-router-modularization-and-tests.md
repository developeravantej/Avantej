# apps/server Router Modularization + Router Test Coverage

## Problem

Two related backend-hygiene gaps in `apps/server`:

1. **Oversized routers.** `apps/server/src/routers/` has ~14 router files over 400 LOC. The CI LOC gate (`scripts/ci/check-router-file-loc.mjs`) **only scans `packages/api/src/routers`**, so these are large but ungated — they grow unchecked. Offenders as of May 2026 (re-measure before starting — a concurrent audit-prove task was editing several):

   | Router | LOC |
   |---|---|
   | `admin.ts` | 1047 |
   | `customer-profiles.ts` | 972 |
   | `payments.ts` | 922 |
   | `platform-admin-tenants-billing.ts` | 684 |
   | `platform-admin-tenants.ts` | 549 |
   | `auth.ts` | 514 |
   | `platform-admin-coupons.ts` | 502 |
   | `ghl.ts` | 487 |
   | `platform-admin-billing.ts` | 484 |
   | `invitations.ts` | 439 |
   | `platform-admin-tenants-comms.ts` | 422 |
   | `partner-stripe.ts` | 421 |
   | `platform-admin-tenants-tags.ts` | 405 |

2. **Thin router test coverage.** Only ~4 of 33 routers have dedicated tests, despite strong service-layer coverage. Untested high-value routers include `payments`, `customer-profiles`, `admin`, `ghl`, the `platform-admin-*` family, `partner-stripe`, and `subscriptions`.

## Why deferred

- The splitter tool `scripts/split-router-by-marker.mjs` is **hardcoded to `packages/api/src/routers`** (`const routersDir = join(process.cwd(), "packages/api/src/routers")`). It does not work on `apps/server` routers — so these splits are either manual or require generalizing the tool first.
- `noUnusedLocals` is ON, so the splitter's duplicated import headers must be hand-cleaned in every produced module (this is the bulk of the manual effort — see the `packages/api` payouts/service-members split for the pattern, commit `65d1f1de`).
- Attempted during a session where a concurrent **audit-prove** task was actively editing `apps/server` routers (`partner-stripe.ts`) **and** the server-router tests (`hierarchy.test.ts`, `invitations.test.ts`). Doing the work in parallel would have guaranteed conflicts, so it was deferred to a clean tree.

## Scope

- **Tooling:** generalize `split-router-by-marker.mjs` to take a base directory (e.g. a `--dir` arg or a second positional), OR split the `apps/server` routers manually following the established folder-module pattern: original file → 2-line re-export shim, domain modules `<module>.procedures.ts`, plus `index.ts` that spreads them.
- **Gate:** extend `scripts/ci/check-router-file-loc.mjs` to also scan `apps/server/src/routers` (decide the threshold — 400 to match, or a higher server-specific budget) so this never regresses.
- **Splits:** break the 14 offenders into domain folder-modules, each ≤ the chosen budget. Clean all unused imports the splitter duplicates (build must stay green under `noUnusedLocals`).
- **Tests:** add unit tests for the highest-value untested routers using the existing helpers (`apps/server/src/tests/helpers/db-mock.factory.ts`, `context.factory.ts`, `fixtures.ts`). Prioritize `payments`, `customer-profiles`, `admin`, `ghl`, `partner-stripe`, the `platform-admin-*` set.

## Out of scope

- `packages/api` routers — already gated; `payouts` + `service-members` were split in `65d1f1de`.
- Any behavior change. Splits are **pure refactors** — move procedures verbatim, adjust imports/exports only. No signature, validation, or query-key changes.
- Integration tests requiring live Stripe/Neon (track separately).

## Acceptance criteria

- Every `apps/server/src/routers/*.ts` file is ≤ the chosen LOC budget (or the gate is extended and passing on the current tree).
- `bun check-types` green across the monorepo (watch `noUnusedLocals` in every new module).
- New router unit tests pass; the tested-router ratio is meaningfully up from ~4/33.
- `bun check` (oxlint) reports 0 errors on the new/changed files.
- No behavior diffs — existing tests still pass unchanged.
