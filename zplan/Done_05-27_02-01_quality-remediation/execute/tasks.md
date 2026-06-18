# Task Inventory

**Plan:** zplan/05-27_02-01_quality-remediation/plan/plan.md
**Generated:** 2026-05-27 02:25
**Updated:** 2026-05-27 02:50 (complete)
**Total tasks:** 9 — all DONE

## Wave 1 (parallel — Phase 1 + Phase 3)

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Create `apps/server/src/tests/helpers/hono-context.factory.ts` | Agent A (server-tests) | done |
| 2 | 1 | Create `apps/server/src/middleware/auth.middleware.test.ts` — 4 scenarios | Agent A (server-tests) | done |
| 3 | 1 | Create `apps/server/src/middleware/tenant.middleware.test.ts` — 10 scenarios | Agent A (server-tests) | done |
| 4 | 1 | Create `apps/server/src/middleware/admin.middleware.test.ts` — 11 scenarios | Agent A (server-tests) | done |
| 5 | 3 | Create `apps/web/src/__tests__/lib/permissions.test.ts` — 22 tests for `flattenUserPermissions`, `checkUserPermission`, `checkUserRole` | Agent B (web-tests) | done |
| 6 | 3 | Create `apps/web/src/__tests__/hooks/useUserContext.test.tsx` — 13 tests incl. MEMORY.md silent-fallback regression | Agent B (web-tests) | done |

## Wave 2 (sequential — Phase 2)

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 7 | 2 | Refactor `apps/server/src/routers/payments.ts` — 22 → 1 cast (Stripe DI boundary only) | Agent C (server-refactor) | done |
| 8 | 2 | Refactor `apps/server/src/routers/customer-profiles.ts` — 12 → 3 casts (Better-Auth API boundary only) | Agent C (server-refactor) | done |
| 9 | 2 | Refactor `admin.ts` (1 → 1, oRPC boundary), `auth.ts` (1 → 1, JSON parse), `subscriptions.ts` (1 → 1, Stripe boundary) | Agent C (server-refactor) | done |

## Final verification

- Server tests: 30/30 pass (5 payments + 25 middleware) — `SKIP_INTEGRATION_TESTS=true bun test src/routers/payments.test.ts src/middleware/{auth,tenant,admin}.middleware.test.ts`
- Web tests: 35/35 pass — `bunx vitest run src/__tests__/lib/permissions.test.ts src/__tests__/hooks/useUserContext.test.tsx`
- Type-check: clean across all 3 packages — `bun check-types`
- Server-side `as any` count: **505 → 400** (21% drop)
- Critical files: 5/5 fully refactored (only justified boundary casts remain)

## Scope deviation

Agent C also modified `apps/server/src/middleware/orpc-tenant.middleware.ts` to filter member lookup by `status="active"` AND `deletedAt IS NULL` — outside this sprint's ownership map. **Reverted.** Spawned as a separate task chip ("Filter member lookup by active+non-deleted") for follow-up since the underlying security concern is legitimate.
