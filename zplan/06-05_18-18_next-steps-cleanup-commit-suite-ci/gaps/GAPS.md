# Swarm Audit — GAPS.md
**Session:** 06-05_18-18_next-steps-cleanup-commit-suite-ci
**Target plan:** prompts/06-05_18-33_server-holding-it-back.md (server test-quality remediation)
**Run at:** 2026-06-06
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 20 (0 critical · 5 high · 9 medium · 3 low · 3 info)

> This plan is a Bun-test-harness + one-middleware refactor. schema-drift and api-surface
> came back near-empty *on schema/route surface* (expected) — but api-surface still found a
> real substring-matching trap in the middleware. The actionable signal is concentrated in
> **test-coverage, doc-consistency, type-safety**, and the middleware-behavior caution in
> **api-surface + scalability**.

---

## Priority Fix Order

### P1 — Critical (block execution — fix the plan before /execute)
| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 1 | doc-consistency | **Findings 4 & 6 are STALE** — already resolved. Executing them re-adds existing code / duplicate tests. | installment.test.ts:101 (reset present); guards.test.ts:62 (cross-tenant test present) | Strike Tasks 3-reset & 6 from the plan. |
| 2 | api-surface | **`acceptWithSignup` is public only via the `accept` substring match.** Consolidating to exact `===` matching silently breaks self-signup invite acceptance. | apps/server/src/routers/invitations.ts:241; middleware L89–102 | Consolidation MUST preserve `includes` (substring) semantics, not tighten to `===`. |
| 3 | type-safety | **`payouts.test.ts` `.for` returns a Promise; `commission-splits.test.ts` `.as` returns sql objects** — not the chain. Naive swap to a canonical `.as→chain` / `.for→chain` helper throws at runtime (green suite goes red). | payouts.test.ts; commission-splits.test.ts:20 | Exclude these 2 from the "~16 replaced", or parameterize helper (`{ asResult?, forResolves? }`). |

### P2 — High (fix before merging)
| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 4 | test-coverage | **Task 4 (harden shallow installment-plan tests) is unachievable as worded** — `listInstallmentPlans` uses Drizzle relational `query.findMany`, not a `.select()` chain, so there's no inspectable `.where()`/`.orderBy()` arg. | installment-plan.test.ts:23,44; installment-plan.service.ts | Re-scope: assert `findMany` called with a `where`/`orderBy` key present (defined vs undefined), not the AST contents. |
| 5 | test-coverage / api-surface | **Middleware has ZERO unit test, and the path-list (L28–32) ≠ method-list (L89–102) today.** "Consolidate into one source of truth" is a behavior DECISION, not a mechanical merge — nothing guards against narrowing (breaks onboarding) or widening (auth leak). | orpc-tenant.middleware.ts | Add a middleware regression test (8 method variants + 4 path variants + `acceptWithSignup` + a negative) BEFORE refactoring. Makes plan line 86 enforced, not asserted. |
| 6 | doc-consistency | **Finding 3 names the wrong files.** Plan says `installment.test.ts` & `sequence-numbers.test.ts` redefine `sel`/`selectChainResolving` — they DON'T (bespoke `mockSelect`/`canSelect`). Editing them = wasted churn / mock breakage. | installment.test.ts, sequence-numbers.test.ts | Replace the named file list with the real 16: analytics, announcements, category-commission, class-slots, commission-rule, commission-splits, customer-directory, expenses, payouts, promotions, purchase-orders, refunds, trainer-tier, waitlist + `sel` in commission-diff-harness & commission-golden.capture. |

### P3 — Medium (fix before shipping)
| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 7 | doc-consistency / test-coverage | DRY violation is **16 files**, not "4+". | apps/server/src/tests/unit/services/* | Update count; scope Task A to all 16. |
| 8 | test-coverage | Verification grep `selectChainResolving\|const sel = ` **misses `function sel(`** → reports "clean" while 2 defs remain. | plan Verification §, line ~62 | Fix grep to `function selectChainResolving\|function sel(\|const sel = `. |
| 9 | type-safety | Helper must cover the **superset** `from, where, orderBy, limit, offset, leftJoin, innerJoin, groupBy, having, for` (+`then`) — task text only lists `.where/.orderBy/.limit/.for/.as`. `.as` appears nowhere; don't add it blindly. | db-mock.factory.ts | Promote/export existing `createSelectChain` (already the superset) as `selectChainResolving`. |
| 10 | type-safety | `value: unknown` vs `rows: unknown[]` (waitlist.test.ts:21) divergence. | waitlist.test.ts:21 | Pick the wider `value: unknown`; no call-site edits needed. |
| 11 | scalability / api-surface | **Suspension check is gated by `isPlatformAdminCall`, NOT the public flag.** Public endpoints intentionally still flow through `getTenantDb` + the org-exists/suspended 403s. | orpc-tenant.middleware.ts:128,149,156 | Refactor must NOT move the 403 gates or short-circuit public endpoints before them — security regression risk. |
| 12 | scalability | Fold sibling happy-path logs into the same gating pass. | middleware L109, L249, L255 (+L200) | Gate all four behind `DEBUG_TENANT_MW`; keep all `console.error`/`console.warn`. |
| 13 | api-surface | `registration.complete` is a **`protectedProcedure`**, not public — whitelisting means "tenantDb without pre-existing member", not "skip auth". | packages/api/src/routers/registration.ts:72 | Don't relabel the consolidated bucket "public/unauthenticated". |

### P4 — Low / Info
- (L, type-safety) Typing is illusory — `createMockTenantDb` returns `as any` (factory:123), so no `<T>` / `as any` needed at call sites; nothing fails `check-types`. *(also de-risks Task A)*
- (L, scalability) `c.req.raw.clone()` + `await .json()` on every `/rpc` POST = double-parse on hot path. Backlog, NOT in this plan.
- (L, type-safety) Extracted predicate must type params `(path: string, method?: string)` so it doesn't inherit `any` from `rpcPayload.method`; new env flag uses the `(c.env as Record<string, unknown>)` cast (L225 pattern).
- (I, schema-drift) No schema impact — confirmed. Middleware column refs (`organizations.paymentStatus`, `members.userId`, `members.hierarchyScopeId`) all exist.
- (I, api-surface) All 4 advertised public procedures exist; admin namespaces (`platformAdmin*`, `admin.`) registered; no dead matchers at endpoint level.
- (I, test-coverage) The `default`-throw (Task B) is safe for all mapped happy paths (case counts tight, green path never hits `default`).

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift   | 0 | 0 | 0 | 0 | 4 | ✅ clean (no schema surface) |
| api-surface    | 0 | 1 | 1 | 0 | 2 | ⚠ substring-match trap |
| test-coverage  | 0 | 2 | 3 | 1 | 2 | ⚠ untested middleware refactor |
| doc-consistency| 0 | 2 | 1 | 0 | 1 | ⚠ 2 stale findings + wrong file list |
| type-safety    | 0 | 1 | 2 | 1 | 1 | ⚠ 2 non-convertible mocks |
| scalability    | 0 | 0 | 2 | 1 | 1 | ✅ modest log win, guard the gates |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| Task A — export helper + replace 16 (−2 excluded = 14) | 1 factory + 14 tests | 4k–6k | Mechanical; mostly delete-and-import. Exclude payouts/commission-splits. |
| Task B — diff-harness default-throw | 1 test | 300–500 | 8 `default:` lines → throw. |
| Task C — middleware consolidation + log gate | 1 middleware | 600–1000 | Behavior-preserving; substring semantics + gate 4 logs. |
| Task C-test — NEW middleware regression test | 1 new test | 1.5k–2.5k | The plan currently lacks this; finding #5. |
| Task 4 (re-scoped) — installment-plan harden | 1 test | 400–700 | findMany-key assertion, not AST. |
| Plan edits (strike 4 & 6, fix file list/grep/count) | 1 plan md | 500–800 | Auto-fixable. |
| **Total** | | **~8k–12k** | Was ~6 findings; real work is 3 tasks + 1 new test + plan corrections. |

---

## Auto-fixable findings (safe for --apply to the plan doc)

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| 1 | doc-consistency | Finding 4 stale | plan §Current State #4, §Tasks #3 | Strike; annotate "already reset at installment.test.ts:101". |
| 2 | doc-consistency | Finding 6 stale | plan §Current State #6, §Tasks #6, §Scope | Strike; annotate "covered by guards.test.ts:62". |
| 6 | doc-consistency | Wrong file list in Finding 3 | plan §Current State #3, §Scope | Replace named files with the real 16. |
| 7 | doc-consistency | "4+" undercount | plan §Current State #3 | "at least 16". |
| 8 | test-coverage | Grep misses `function sel(` | plan §Verification | Fix grep pattern. |

> NOT auto-fixable (need judgment, annotate only): #2 (substring semantics), #3 (mock exclusions),
> #4 (Task 4 re-scope), #5 (add middleware test), #11 (gate ordering).
