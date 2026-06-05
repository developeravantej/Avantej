# Fix apps/server "Holding It Back" Review Findings

> Handoff prompt generated 2026-06-05 · Branch: test/unit-suite-green-and-ci-fix · Project: Avantej

## Mission

Resolve the 6 backend code-quality findings that capped the `apps/server` review at 7/10: a brittle positional select-counter test harness, shallow mock-passthrough CRUD tests, `selectChainResolving` duplicated across files, a latent test-order-dependence bug, accumulated tenant-middleware debt, and missing cross-tenant isolation coverage. Done = each finding fixed or explicitly deferred with rationale; `cd apps/server && bun test:unit` green; no production behavior change.

## Context

**Project:** Avantej — multi-tenant gym/fitness SaaS, database-per-tenant via Neon branches.
**Stack:** Cloudflare Workers + oRPC + Drizzle (`@neondatabase/serverless`) + Better-Auth + Bun test. See CLAUDE.md "Server-Only Services & Cron", "Router Guards", "Server tests".
**Branch:** test/unit-suite-green-and-ci-fix
**Recent work:**
- `1782339c` test(customers): regression coverage for directory-500 BIGINT mapping
- This branch greened the unit + integration suites (~270 changed test files, ~33k insertions).
- Review confirmed the financial-invariant tests are excellent; debt is in harness fragility and the simpler-service tests.

## Current State

The financial tests (commission-math, golden diff harness, BIGINT regression, installment parity) are production-grade and must be preserved. Residual debt:

1. **Brittle positional select-counter** — `commission-diff-harness.test.ts` uses a `switch(n)` on the select-call index to return per-query mock data; adding/reordering a service query silently misaligns, and `default: return sel([])` hides the misalignment instead of failing loudly.
2. **Shallow CRUD tests** — e.g. `installment-plan.test.ts` asserts `result` equals the exact fixture the mock returned (passthrough), and the `activeOnly` test passes trivially without verifying the query was built with a filter. Similar shallowness in other simple-service suites.
3. **DRY violation** — `selectChainResolving` (a.k.a. local `sel()`) is re-defined in **16 files** (corrected from "at least 4" after audit-swarm) instead of imported from the factory. <!-- audit-swarm: CORRECTED — the named files were wrong. `installment.test.ts` and `sequence-numbers.test.ts` do NOT define `sel`/`selectChainResolving` (they use bespoke `mockSelect`/`canSelect`). The real 16: analytics, announcements, category-commission, class-slots, commission-rule, commission-splits, customer-directory, expenses, payouts, promotions, purchase-orders, refunds, trainer-tier, waitlist (`selectChainResolving`) + commission-diff-harness, commission-golden.capture (`sel`). ⛔ payouts (`.for`→Promise) and commission-splits (`.as`→sql) have divergent mocks and were EXCLUDED from centralization. -->
4. ~~**Latent test-order bug** — `installment.test.ts` … never reset in `beforeEach`~~ <!-- audit-swarm: RESOLVED/STALE — `installment.test.ts:101` already resets `mockSelectResult.length = 0` inside `beforeEach`. No bug. Do not action. -->.
5. **Tenant-middleware debt** — `apps/server/src/middleware/orpc-tenant.middleware.ts` (~286 LOC) duplicates public-endpoint detection across 3 places (path-based + two method-based checks, ~lines 28–32 and ~89–102); `console.log("✅ Tenant DB set up …")` (~line 201) fires on every prod request.
6. ~~**No cross-tenant isolation unit tests**~~ <!-- audit-swarm: RESOLVED/STALE — `packages/api/src/guards.test.ts:62` already has a full `assertOrgContextMatch` suite (ORG_A ctx rejecting ORG_B input, empty-string fail-closed, trailing-space). Do not action. -->

## Scope

**In scope:**
- `apps/server/src/tests/helpers/db-mock.factory.ts` (export a canonical select-chain helper)
- `apps/server/src/tests/unit/services/commission-diff-harness.test.ts`
- `apps/server/src/tests/unit/services/installment.test.ts`
- `apps/server/src/tests/unit/services/installment-plan.test.ts`
- `apps/server/src/tests/unit/services/sequence-numbers.test.ts`
- Other unit test files that locally redefine `selectChainResolving`/`sel`
- `apps/server/src/middleware/orpc-tenant.middleware.ts`
- A new/existing guard unit test for cross-tenant rejection (`packages/api/src/guards.ts` consumers)

**Out of scope (do not touch):**
- The excellent financial tests' assertions (`commission-math.test.ts`, `pos-installment-parity.test.ts`) — only refactor their shared helpers, never weaken the invariants.
- Production service business logic (no behavior changes to commission/installment/payout math).
- Schema, migrations, `tenant-migrations.generated.ts`.
- `index.ts` scheduled handler and CORS (reviewed clean).

## Tasks

1. Add a canonical, well-typed select-chain mock helper to `tests/helpers/db-mock.factory.ts` (covering `.where/.orderBy/.limit/.for/.as`), then replace the locally-redefined `selectChainResolving`/`sel()` in the 4+ test files with imports.
2. Refactor `commission-diff-harness.test.ts` away from the positional `switch(n)` counter: key mock responses by query intent (table/predicate) or make the `default` branch THROW with the call index + a dump, so a misaligned query fails loudly instead of returning `[]`.
3. ~~Reset the module-level `mockSelectResult` … in `installment.test.ts`~~ <!-- audit-swarm: SKIP — already reset at installment.test.ts:101. -->
   **Re-scoped Task 4 (shallow installment-plan tests):** `listInstallmentPlans` uses Drizzle relational `query.findMany` (no inspectable `.where()` chain), so assert on the `findMany` call ARG — `orderBy` defined with length 2, and `where` defined only when `activeOnly` — rather than the opaque AST. ✅ DONE.
4. Harden the shallow tests in `installment-plan.test.ts` (and similar): assert on the query construction (filter/orderBy args passed to the mock), not just that the mock's return value flows through unchanged.
5. In `orpc-tenant.middleware.ts`, consolidate public-endpoint detection into a single source of truth (one list/predicate) consumed by both path- and method-based checks; gate the success `console.log` behind a debug flag (or remove it) so it does not fire on every prod request.
6. ~~Add a guard-level unit test asserting cross-tenant rejection~~ <!-- audit-swarm: SKIP — already covered by packages/api/src/guards.test.ts:62. -->
   **Added instead (audit-swarm gap #5):** the public-endpoint consolidation in Task 5 changes production middleware behavior with NO test guarding it, and the path-list ≠ method-list today. Add a middleware regression test over all method/path variants + `acceptWithSignup` + a negative case so "behavior-preserving" (Constraint line 86) is enforced, not merely asserted. <!-- NOTE: not yet written — flagged as recommended follow-up. -->

## Verification

- [ ] `cd apps/server && bun test:unit` → all green (individual files AND combined run — watch the Bun `mock.module` process-global pitfall)
- [ ] `commission-diff-harness.test.ts` fails loudly (clear error) when a select call is unmapped — confirm by temporarily inserting a stray query
- [ ] `installment.test.ts` passes when run twice consecutively and inside the full suite (no order dependence)
- [ ] `grep -rn "function selectChainResolving\|function sel(\|const sel = " apps/server/src/tests` shows only the factory definition + imports (prior pattern MISSED `function sel(` — corrected by audit-swarm). Note: 2 files (payouts, commission-splits) intentionally retain bespoke local mocks.
- [ ] `grep -rn "console.log" apps/server/src/middleware/orpc-tenant.middleware.ts` → none firing unconditionally on the happy path
- [ ] New cross-tenant guard test present and passing
- [ ] `bun check-types` → 0 errors

## Key References

| Resource | Path / Command |
|----------|---------------|
| Test conventions | `CLAUDE.md` → "Server tests", "Router Guards" |
| Mock factory | `apps/server/src/tests/helpers/db-mock.factory.ts` |
| Context factory | `apps/server/src/tests/helpers/context.factory.ts` |
| Fixtures | `apps/server/src/tests/helpers/fixtures.ts` |
| Guards | `packages/api/src/guards.ts` |
| Tenant middleware | `apps/server/src/middleware/orpc-tenant.middleware.ts` |
| Run unit tests | `cd apps/server && bun test:unit` |
| Single file | `cd apps/server && bun test src/tests/unit/services/<file>.test.ts` |
| Type check | `bun check-types` |

## Constraints

- Bun `mock.module` is process-global (first-factory-wins per specifier) — preserve the spread-real-exports + override-specifics mitigation; do NOT widen barrel mocks (it regresses combined runs). See CLAUDE.md context.
- Do not weaken any financial-invariant assertion — refactor helpers only.
- No Node-only imports in server code paths (Workers constraint); DB stays on `@neondatabase/serverless`.
- Behavior-preserving for production middleware: the public-endpoint consolidation must keep the exact same set of endpoints public.
- Do not change tenant migration files or the generated migrations module.

## Agent Recommendation

**Suggested agent:** backend-engineer
**Why:** Every task is Bun-test harness refactoring, Drizzle mock typing, oRPC middleware, and tenant-guard logic within `apps/server` — the agent's core domain.
