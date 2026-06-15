# Test-Coverage Audit — "Server Holding It Back" remediation plan

**Plan:** `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/prompts/06-05_18-33_server-holding-it-back.md`
**Auditor lens:** meta — does the plan's done-condition actually verify what it claims to fix, and does the refactor preserve existing coverage?
**Date:** 2026-06-06

## Counts

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 |
| MEDIUM   | 3 |
| LOW      | 1 |
| INFO     | 2 |

Highest-value finding: **G1 — the middleware refactor (plan finding 5) has zero test coverage to prove behavior preservation.**

---

## Findings

### G1 — Middleware "behavior-preserving" refactor has no guarding test (HIGH)

**Plan claims:** Finding 5 / Task 5 consolidate public-endpoint detection in `orpc-tenant.middleware.ts` "into a single source of truth … consumed by both path- and method-based checks", with the Constraint "the public-endpoint consolidation must keep the exact same set of endpoints public."

**Actual:**
- **No unit or integration test exercises `orpc-tenant.middleware.ts`.** Searched all of `apps/server/src/tests`. The only file that even mentions the middleware by name is `apps/server/src/tests/integration/pos-permission-and-suspended.integration.test.ts`, and that exercises the suspended-tenant 403 path through the API boundary — it does **not** cover the public-endpoint (invitation / registration) detection that Task 5 rewrites. Integration tests are also documented as not runnable green locally (MEMORY: "Integration harness blocked").
- The public-endpoint logic the refactor will merge is genuinely non-trivial and duplicated three ways:
  - path check (`orpc-tenant.middleware.ts:28-32`): `getByToken`, `accept`, `verifyEmailByToken`, `registration/complete`.
  - method check (`:89-102`): a **broader** set — same four plus dotted/slashed/exact-match variants AND `registration.complete`.
  - the two are OR-combined at `:104-105`.
- Because path- and method-based lists are **not identical today** (the method list has more exact-match variants), "consolidate into one source of truth" is a real behavior question, not a mechanical merge. Collapsing them risks either narrowing the public set (invitation/registration calls start requiring a session → broken onboarding) or widening it (a non-public method slips through unauthenticated). There is no test that would catch either regression.

**Risk:** A silent multi-tenant / auth-boundary regression on the exact code path the plan calls "behavior-preserving," with nothing in `bun test:unit` (the plan's gate) able to fail.

**File:** `apps/server/src/middleware/orpc-tenant.middleware.ts` (lines 28-32, 89-105)

**Fix:** Before refactoring, add a focused unit test for the consolidated predicate. Extract the public-endpoint decision into a pure exported helper, e.g. `isPublicOrpcEndpoint({ path, method })`, and table-test it against the current TRUE set (`getByToken`, `accept`, `verifyEmailByToken`, `registration/complete` in path and dotted/slashed/exact method forms) and a FALSE set (`members.list`, `sales.create`, empty). That helper is unit-testable with no `mock.module`, sidestepping the process-global pitfall. Make "new middleware-predicate test present and passing" an explicit acceptance criterion — currently Task 5 has **no** falsifiable check (see G6).

---

### G2 — `installment-plan.test.ts` "harden shallow tests" is not achievable as written; the filter is unobservable through the current mock (HIGH)

**Plan claims:** Finding 2 / Task 4: harden the two shallow tests — "asserts `toEqual` passthrough, never checks orderBy was applied" and "filters by activeOnly … passes even if service ignores the filter" — by asserting "on the query construction (filter/orderBy args passed to the mock), not just that the mock's return value flows through unchanged."

**Actual:** The service does NOT use the chainable `select()` mock. `listInstallmentPlans` (`packages/services/src/installment-plan.service.ts:28-42`) calls:
```ts
tenantDb.query.installmentPlans.findMany({
  where: conditions.length ? and(eq(installmentPlans.isActive, true)) : undefined,
  orderBy: [asc(installmentPlans.sortOrder), asc(installmentPlans.code)],
});
```
`query.installmentPlans.findMany` is mocked by `createQueryTable` in the factory as `mock(() => Promise.resolve(defaults.findMany ?? []))` — it returns a canned value regardless of args. To "assert on the filter/orderBy args" the test would have to inspect the **first argument** passed to `findMany` and assert its `where`/`orderBy`. But those are opaque Drizzle relational-query objects: `where` is the result of `and(eq(...))` (an internal SQL AST node), and `orderBy` is `[asc(...), asc(...)]`. There is no stable, readable surface to assert "filters by isActive=true" — you can at best assert `where !== undefined` when `activeOnly` is true and `=== undefined` when false. That is a real improvement over the current trivial test, but it is **not** what Task 4's wording implies ("assert the query was built with a filter"), and the plan does not acknowledge that these services bypass the `select` chain entirely.

**Risk:** An implementer follows Task 4 literally, tries to assert on `select().where` call args, finds nothing there (the service never calls `select`), and either (a) writes a still-trivial test, or (b) wastes effort reverse-engineering Drizzle AST internals to make a brittle assertion. The done-condition ("hardened") is not concretely defined.

**File:** `apps/server/src/tests/unit/services/installment-plan.test.ts:23-52`; service at `packages/services/src/installment-plan.service.ts:28-42`

**Fix:** Re-scope Task 4 to the realistic assertion for `query.*.findMany`-based services: capture the call arg and assert `expect(call.where).toBeUndefined()` (no `activeOnly`) vs `expect(call.where).toBeDefined()` (with `activeOnly: true`), and assert `call.orderBy` is present / has length 2. State explicitly that these services use the relational-query API, not the `select` chain, so the harness centralization (Task 1) does NOT touch them.

---

### G3 — Turning `default` into a throw is safe for the mapped cases, but the diff harness is structurally fragile in a way the throw does not fix (MEDIUM)

**Plan claims:** Finding 1 / Task 2: replace `default: return sel([])` so an unmapped select "fails loudly instead of returning `[]`."

**Actual (will it break a currently-passing test?):** I traced each builder's `switch(n)` against the corpus. The mapped case counts are tight and match the documented call sequence:
- `buildA1Db`/`buildA2Db`: cases 1-10 (10 selects).
- `buildA5Db`: 1-11.
- `buildA6Db`: 1-8 (then service short-circuits on `no_tier_rate` → no cap check; `default` is currently a fallthrough safety net, NOT exercised on the happy path).
- `buildP1Db`: 1-12; `buildP2Db`: 1-13; `buildP3Db`: 1-4 (context returns null → `[]`).

For every case the comments assert the service makes **exactly** the mapped number of selects, so on the green path `default` is never hit. Converting it to a throw should therefore keep all 9 tests green **iff the comments are accurate**. The latent risk the plan correctly anticipates: if any service path makes even one un-asserted extra `select` (e.g. an A6/P3 cleanup query, or an audit read), the throw will surface a **currently-hidden over-call** as a new failure. That is the intended behavior (fail loudly) — but the plan frames Task 2 as zero-risk, and it is not: it can turn a latent silent over-call into a red suite, which is good but must be expected during execution, not treated as a regression.

**Risk:** Implementer adds the throw, a hidden over-call in A6/P3 (the `[]`-returning cases, which rely on `default` more than the happy cases) lights up red, and it gets misdiagnosed as "the throw broke the test" and reverted — defeating the fix.

**File:** `apps/server/src/tests/unit/services/commission-diff-harness.test.ts:156-157, 221-222, 301-302, 357-358, 418-419, 497-498, 548-549`

**Fix:** Keep the throw, but in the throw message dump `n` and the case id so an over-call is self-diagnosing. Before committing, run each builder once and confirm the green path still never reaches `default` (especially A6 and P3, whose terminal `default` branches are load-bearing today). Note in the plan that a new failure here is a *discovered latent bug*, not the refactor breaking.

---

### G4 — Centralization superset is correct; one variant has a different param name + reduced method set, watch the find-replace (MEDIUM)

**Plan claims:** Finding 3 / Task 1: 4+ files redefine `selectChainResolving`/`sel`; replace with a canonical factory import covering `.where/.orderBy/.limit/.for/.as`.

**Actual:** There are **16** local definitions (grep for `selectChainResolving|const sel = |function sel(`), not "4+" — the plan undercounts (it says "at least 4"). The factory's private `createSelectChain` (`db-mock.factory.ts:4-29`) is **not currently exported** — only `createMockTenantDb` is — confirming the DRY violation premise. Variants found:

| File(s) | Fn name | Param | Method set |
|---|---|---|---|
| `db-mock.factory.ts` (`createSelectChain`, private) | — | `returnValue` | from, where, orderBy, limit, offset, leftJoin, innerJoin, groupBy, having, **for** |
| `commission-diff-harness.test.ts`, `commission-golden.capture.test.ts` | `sel` | `value` | from, where, orderBy, limit, offset, leftJoin, innerJoin, groupBy, having, **for** |
| `analytics.test.ts`, `class-slots.test.ts`, `announcements.test.ts`, `expenses.test.ts`, `commission-splits.test.ts`, `customer-directory.test.ts`, `payouts.test.ts`, `trainer-tier.test.ts`, `category-commission.test.ts` | `selectChainResolving` | `value` | from … having (NO `for`) |
| `refunds.test.ts`, `purchase-orders.test.ts`, `promotions.test.ts`, `commission-rule.test.ts` | `selectChainResolving` | `value` | from … having + **for** |
| `waitlist.test.ts` | `selectChainResolving` | **`rows`** | **only** from, where, orderBy, **for**, limit (NO offset/joins/groupBy/having) |

**Every local set is a SUBSET of the factory's** `from, where, orderBy, limit, offset, leftJoin, innerJoin, groupBy, having, for`. So exporting `createSelectChain` (or a `selectChainResolving` alias) as the single canonical helper is **safe — no test loses a method it relies on**. The `.as` method the plan lists in Task 1 is NOT present in any current variant; adding it is harmless. Two snags for the implementer:
1. `waitlist.test.ts` names its param `rows: unknown[]` (typed array) while everyone else uses `value: unknown`. A blind find-replace of the call sites is fine (the arg is positional), but the call sites must keep passing the same value.
2. No variant defines `.as`; if Task 1 adds it, fine, but it is not load-bearing — do not gate the centralization on it.

**Risk:** Low for breakage (superset is proven), but the plan's "4+ files" framing will cause an incomplete sweep — the `grep` acceptance criterion (G6) is what actually catches the other 12.

**File:** 16 files listed above; canonical target `apps/server/src/tests/helpers/db-mock.factory.ts`

**Fix:** Export the existing `createSelectChain` from the factory under a clear name (e.g. `selectChainResolving`), use the full superset (the current factory set), replace all 16 local defs. Trust the `grep -rn "selectChainResolving\|const sel = "` acceptance check to prove completeness — but extend it to also catch `function sel(` (the harness + capture files use `sel`, which the plan's grep pattern `const sel = ` would MISS — see G6).

---

### G5 — Finding 6 ("already covered") is genuinely covered — verified (INFO / confirmed accurate)

**Plan claims:** Finding 6 marked ALREADY COVERED: `packages/api/src/guards.test.ts` has `assertOrgContextMatch` cross-tenant tests.

**Actual:** Confirmed. `guards.test.ts:62-94` covers `assertOrgContextMatch` with: ORG_A context + ORG_B input → `FORBIDDEN` (the exact cross-tenant rejection case the plan asks for in Task 6), matching org passes, null-org no-op, and an exact-match near-miss (trailing space) rejection. Additional cross-tenant depth: `guardInputBranchForContext` null/empty-string bypass rejection (`:159-202`, `:357-376`), `guardStoredBranchForContext` (`:208-244`), fail-closed empty-string org (`:341-350`). The file explicitly avoids `mock.module` (header comment), so it is safe for the combined run. **Finding 6 is correctly marked already-covered; Task 6 is redundant and can be dropped** (or downgraded to "verify guards.test.ts still passes").

**File:** `packages/api/src/guards.test.ts:62-94`

---

### G6 — Three acceptance criteria are not falsifiable as written (MEDIUM)

**Plan claims:** The Verification checklist is the done-condition.

**Actual — gaps in the checklist:**
1. **Task 5 has no acceptance criterion at all.** The only middleware check is `grep -rn "console.log" … → none firing unconditionally on the happy path` — that covers the `console.log` gating (the trivial half of Task 5) but **nothing verifies the public-endpoint consolidation preserved the endpoint set** (the risky half — see G1). There is no test, no grep, no behavioral assertion for it. This is the single largest hole.
2. **The `selectChainResolving` grep pattern misses `sel`.** Acceptance says `grep -rn "selectChainResolving\|const sel = " apps/server/src/tests`. The harness (`commission-diff-harness.test.ts:71`) and capture (`commission-golden.capture.test.ts:63`) define it as `function sel(value: unknown)` — which matches **neither** `selectChainResolving` nor `const sel = `. The grep will report "clean" while two `sel()` definitions remain. Pattern must add `function sel(`.
3. **"`commission-diff-harness.test.ts` fails loudly when a select call is unmapped — confirm by temporarily inserting a stray query"** is a good manual check but is not encoded; it relies on the implementer doing a throwaway edit and remembering to revert it. Acceptable as a manual step, but flag that it leaves no lasting regression guard (the throw itself is the guard, which is fine).

**Falsifiable criteria that ARE solid:** `bun test:unit` green per-file + combined, `installment.test.ts` run-twice isolation (Task 3 — concrete), `bun check-types` 0 errors.

**Fix:** Add to the Verification checklist: (a) "new `isPublicOrpcEndpoint` predicate unit test present and passing, covering the full public TRUE set + a non-public FALSE set"; (b) fix the grep to `grep -rnE "selectChainResolving|const sel = |function sel\("`.

---

### G7 — Finding 4 ("already fixed") — not independently re-verified here (LOW)

**Plan claims:** Finding 4 ALREADY FIXED: `installment.test.ts` module-level `mockSelectResult` reset in `beforeEach` (~line 101).

**Actual:** Out of primary scope for this meta-audit (the file is `installment.test.ts`, distinct from the `installment-plan.test.ts` I examined in depth for G2). The plan's own Task 3 still lists resetting `mockSelectResult` and verifying run-twice isolation as work, which is mildly inconsistent with finding 4 calling it "already fixed." Recommend the implementer spot-check `installment.test.ts:~101` for the `beforeEach` reset before treating Task 3 as a no-op — per the project rule that DONE markers are frequently inaccurate. Not a coverage gap, just a consistency note.

**File:** `apps/server/src/tests/unit/services/installment.test.ts` (~line 101)

---

## Summary

The plan's test-quality fixes are mostly sound and the two "already done" markers check out (G5 fully verified; G7 a minor consistency note). The serious gaps are about **whether the done-condition proves what it claims**:

- **G1 (HIGH):** The middleware public-endpoint consolidation — the only production-behavior change in the plan — has **zero** test coverage today and **no** acceptance criterion (G6.1). A "behavior-preserving" refactor with nothing to prove behavior was preserved, on a multi-tenant auth boundary. Add a pure `isPublicOrpcEndpoint` helper + table test BEFORE refactoring.
- **G2 (HIGH):** Task 4's "assert on the filter/orderBy args" is not achievable as worded — `listInstallmentPlans` uses the Drizzle relational-query API (`query.findMany`), not the `select` chain, and its args are opaque AST nodes. Re-scope to `where` defined/undefined + `orderBy` present.
- **G3/G4 (MEDIUM):** The `default`-throw is safe for the mapped happy paths but can surface latent over-calls (especially in the `[]`-returning A6/P3 builders whose `default` is load-bearing) — expect that, don't revert it. Centralization is safe: all 16 (not "4+") local variants are subsets of the factory superset; export the existing private `createSelectChain`.
- **G6 (MEDIUM):** Three acceptance criteria aren't falsifiable — Task 5 has no check, the grep pattern misses `function sel(` (leaving 2 defs undetected), and the "fails loudly" check is manual-only.

**Recommended plan edits:** (1) add a middleware-predicate unit test + acceptance criterion; (2) re-scope Task 4 to the relational-query reality; (3) widen the centralization grep to `grep -rnE "selectChainResolving|const sel = |function sel\("`; (4) note that a new red in the diff harness after the throw is a discovered bug, not a regression; (5) downgrade/drop Task 6 (already covered).
