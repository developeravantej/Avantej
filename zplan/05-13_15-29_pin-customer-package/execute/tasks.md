# Task Inventory

**Plan:** zplan/05-13_15-29_pin-customer-package/plan/plan.md
**Generated:** 2026-05-13 16:05
**Total tasks:** 16

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Add `pinnedAt` column + partial uniqueIndex to schema | backend-engineer | done |
| 2 | 1 | Generate migration; verify partial WHERE clause | backend-engineer | done |
| 3 | 1 | Push schema via `bun db:push` | backend-engineer | missed (no such script — tenant migrations apply via drizzle-kit runner) |
| 4 | 1 | Update `listPackageInstancesForClient` ordering | backend-engineer | done |
| 5 | 1 | Add `togglePackagePin` service function | backend-engineer | done |
| 6 | 1 | Export `togglePackagePin` from services index | backend-engineer | done |
| 7 | 1 | Add `togglePackagePin` unit tests | backend-engineer | done |
| 8 | 2 | Add `togglePin` oRPC procedure | backend-engineer | done |
| 9 | 2 | Modify `getActiveForClient` to prefer pinned | backend-engineer | done |
| 10 | 2 | Verify `listForClient` row shape includes `pinnedAt` | backend-engineer | done |
| 11 | 2 | Run integration smoke (type-check only — full integration deferred to user) | backend-engineer | done |
| 12 | 3 | Add `togglePin` mutation + pin header button to packages/[id].tsx | mobile-engineer | done |
| 13 | 3 | Style pin button | mobile-engineer | done |
| 14 | 4 | Add pin badge + sort verification to packages/index.tsx | mobile-engineer | done |
| 15 | 4 | Verify dashboard Active Plan card | mobile-engineer | done |
| 16 | 4 | Smoke test Journey 3 fallback | mobile-engineer | deferred (manual, user-driven) |
