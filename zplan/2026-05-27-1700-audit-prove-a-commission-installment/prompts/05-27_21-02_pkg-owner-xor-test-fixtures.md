# Fix pre-existing `pkg_owner_xor` integration test fixture failures

> Handoff prompt generated 2026-05-27 21:00 · Branch: `audit-prove-a/commission-installment-20260527-1700` · Project: Avantej

## Mission

The integration test suite under `apps/server/src/tests/integration/` has 11 pre-existing test failures caused by the `pkg_owner_xor` check constraint on `package_instances`. The constraint enforces that EITHER `client_id` OR `walk_in_customer_id` is set (XOR), but the test fixtures populate both (or neither) on package-instance seed rows, violating the constraint. These failures are orthogonal to the audit-prove-a work but block clean CI. Fix the fixtures so all integration tests can run cleanly.

## Context

**Project:** Avantej — multi-tenant SaaS (TanStack Router + oRPC + Drizzle + Better-Auth + Cloudflare Workers + Bun monorepo)
**Stack relevant here:** Bun test runner, Drizzle ORM, Neon Postgres (real DB integration tests), test fixtures under `apps/server/src/tests/`
**Branch:** `audit-prove-a/commission-installment-20260527-1700`
**Recent work:**
- `2b8c88ec fix(audit-prove-a): commission + installment remediation across both iterations` — F-INS-3 race fix verified against 11 PASSING tests but flagged 11 FAILING tests as pre-existing fixture issues, not caused by the lock-order changes

The relevant DB constraint (migration `0027_walkin_commission.sql:6-8`):
```sql
ALTER TABLE package_instances ADD CONSTRAINT pkg_owner_xor CHECK (
  (client_id IS NULL) <> (walk_in_customer_id IS NULL)
) NOT VALID;
```

So a `package_instances` row is valid IFF exactly one of `client_id` / `walk_in_customer_id` is non-NULL (true XOR). Test fixtures appear to either leave both NULL or set both, violating the constraint at INSERT time.

## Current State

Running `bun test src/tests/integration/installment-*` reports approximately 11 failures with error messages like:
```
PostgresError: new row for relation "package_instances" violates check constraint "pkg_owner_xor"
```

The failures cluster in fixtures that seed `package_instances` rows for installment tests, refund tests, and commission tests where the package belongs to a customer.

Agent R's run during the audit-prove-a session confirmed: `11 pass / 11 fail / baseline identical before and after stash` — meaning these failures predate the audit-prove work and are caused by fixture data, not by F-INS-3 or related changes.

## Scope

**In scope:**
- Test fixture files under `apps/server/src/tests/` that seed `package_instances` rows
- Test helper functions that create package instances (look for shared factory functions)
- Integration test files that fail with `pkg_owner_xor` violations

**Out of scope (do not touch):**
- The constraint itself (`pkg_owner_xor` is correct business logic — packages MUST belong to exactly one of client / walk-in)
- Migration `0027_walkin_commission.sql`
- Production code paths that insert into `package_instances` (those already follow the XOR convention)
- Other unrelated integration test failures (e.g. Resend / Stripe env-related skips)

## Tasks

1. Identify the failing tests precisely:
   ```
   cd apps/server
   bun test src/tests/integration/ 2>&1 | grep -E "(fail|pkg_owner_xor)" | head -30
   ```
2. For each failing test, locate the fixture that seeds `package_instances`. Most likely in:
   - `apps/server/src/tests/helpers/fixtures.ts` (shared factory)
   - `apps/server/src/tests/helpers/integration-setup.ts`
   - Inline fixtures inside each `.test.ts` file
3. Find the seed function (likely `createPackageInstanceFixture` or similar). Verify the current shape — is it setting both `client_id` and `walk_in_customer_id`, or neither, or accepting them as optional and falling through to NULL?
4. Update the seed function to enforce the XOR at fixture level:
   ```ts
   function createPackageInstanceFixture(opts: { clientId?: string; walkInCustomerId?: string; ... }) {
     if ((opts.clientId == null) === (opts.walkInCustomerId == null)) {
       throw new Error("createPackageInstanceFixture: must pass exactly one of clientId or walkInCustomerId");
     }
     return { client_id: opts.clientId ?? null, walk_in_customer_id: opts.walkInCustomerId ?? null, ... };
   }
   ```
5. For each failing test, update the call site to pass the correct ONE owner. Most tests likely want a regular client — pass `clientId: testClientId`, omit `walkInCustomerId`. For walk-in-specific tests, do the opposite.
6. Re-run the suite. Aim for 22/22 (or whatever the new baseline is). If a test fails for a DIFFERENT reason (e.g. logic regression unrelated to the constraint), STOP and report — don't paper over real bugs.
7. Add a top-of-file comment to the seed helper documenting the XOR requirement so future devs don't reintroduce the issue.

## Verification

- [ ] `bun test src/tests/integration/` from `apps/server` reports 0 `pkg_owner_xor` failures
- [ ] The previously-failing 11 tests now pass (or skip with a different, intentional reason)
- [ ] The 11 tests that were passing before still pass — no regressions
- [ ] The fixture helper throws an early descriptive error if a caller passes both or neither owner
- [ ] Comment block on the helper documents the XOR convention

## Key References

| Resource | Path / Command |
|----------|---------------|
| Constraint definition | `packages/db/src/migrations/tenant/0027_walkin_commission.sql:6-8` |
| Test fixtures (shared) | `apps/server/src/tests/helpers/fixtures.ts` (likely; verify) |
| Integration setup | `apps/server/src/tests/helpers/integration-setup.ts` |
| Failing tests dir | `apps/server/src/tests/integration/` |
| Run command | `cd apps/server && bun test src/tests/integration/` |
| Schema definition | `packages/db/src/schema/tenant/package-instances.ts` (verify `clientId` and `walkInCustomerId` shape) |

## Constraints

- DO NOT relax the `pkg_owner_xor` constraint — it's correct business logic
- DO NOT add a new column or migration to "work around" the XOR — fix the fixtures
- DO NOT mutate fixtures inside individual `.test.ts` files just to bypass the constraint — fix the shared helper so the fix lands everywhere
- Tests that intentionally check the constraint (negative tests asserting the throw) should remain unchanged — they ARE supposed to fail at INSERT time, but the failure should be CAUGHT in the test, not surface as an uncaught test error
- Do not skip the failing tests — fix them

## Agent Recommendation

**Suggested agent:** `test-engineer`
**Why:** This is a test-fixture data integrity issue, not a code change. The test-engineer agent specifically handles fixture refactoring, integration-test debugging, and CI-blocking flake. Backend-engineer would also work but test-engineer is the better fit because the production code is already correct — only the test data needs realignment.
