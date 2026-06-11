# Raise the code-quality rating of `apps/` (web + server + native)

> Handoff prompt generated 2026-06-09 · Branch: test/unit-suite-green-and-ci-fix · Project: Avantej

## Mission

Drive up the staff-engineer code-quality rating of the entire `C:\Project\Avantej\apps` tree, with primary focus on **apps/web (currently 7.6/10)** and **apps/server (currently 7.8/10)**. "Done" means: god-components/route files are decomposed under the 400-LOC cap and thin-shell convention, query invalidation is standardized on `orpc.*.queryOptions(...).queryKey`, the highest-risk flows have unit tests, tenant migrations have unique sequential prefixes, the server's auth/type-safety smells are removed, and `bun check-types` + web `vitest` + the isolated server runner are all green. This is a **multi-phase, parallel-agent** effort — each phase has explicit file-ownership boundaries below.

## Context

**Project:** Avantej — multi-tenant SaaS for gym/fitness-centre management (members, trainers, packages, appointments, POS sales, installment plans, branch commissions). Tenants are gym owners; end users are non-tech-savvy Malaysian SME front-desk staff.
**Stack:** Turborepo monorepo. **Vite + TanStack Router + Better-Auth + oRPC + Drizzle** (NOT Next.js/Convex/Clerk). Database-per-tenant via Neon branches. Server runs on Cloudflare Workers via Wrangler. Web on port 3021 (proxies `/rpc` → server 3020).
**Branch:** test/unit-suite-green-and-ci-fix
**Recent work (relevant):**
- `42c93c82` fix(neon): stop caching undefined Workers env (unblocked tenant provisioning)
- e2e-deep suite work (webhook refunds, multi-tenant seed, gated specs) — test infra is fresh
- Working tree already has in-flight decomposition: `sales/$id.tsx` (-428 LOC) and `settings/installment-plans.tsx` (-659 LOC) are mid-extraction into `components/pages/sales/` and `components/pages/settings/` (untracked). Continue this pattern; do not clobber it.

## Current State

A just-completed staff-engineer rating produced these scores and concrete weaknesses. Each item below is a real, located defect — not a guess.

### apps/web — 7.6/10

**Architecture (7.5)** — 25 route files + god-components exceed the CI-enforced 400-LOC cap. Worst offenders:
- `apps/web/src/routes/_authenticated/dashboard/_layout/pos/pos-workflow.tsx` — **1791 LOC**
- `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/members-tab.tsx` — **1508 LOC**
- `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/class-slots/view.tsx` — **1460 LOC**
- `apps/web/src/routes/_authenticated/dashboard/_layout/reports/view.tsx` — **1292 LOC**
- `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx` — **1211 LOC**
- `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx` — **1129 LOC**
Convention to apply: route files are thin shells (context extraction + render). Business logic and UI move into `apps/web/src/components/pages/<area>/` and reusable `features/*`.

**Data fetching (7.5)** — two competing query-invalidation conventions coexist: **51 hand-written string keys** like `invalidate: [["appointments"]]` vs **19 correct `orpc.*.queryOptions(...).queryKey` sites**. The string keys do not match the real oRPC query keys → confirmed stale-cache bug class. Confirmed mismatches:
- `apps/web/src/components/calendar/appointment.tsx:143`
- the commissions/refunds dialogs
Standardize ALL invalidation on `orpc.*.queryOptions(...).queryKey`.

**Test coverage (6.0)** — highest-risk flows have **zero** unit tests: `pos-workflow`, `members-tab`, commission payouts.

**Component quality (6.5)** — mega-components imply copy-paste duplication; extracting shared sub-components (see Architecture) is the lever.

### apps/server — 7.8/10

**Migrations discipline (6.5)** — `packages/db/src/migrations/tenant/` has **duplicate numeric prefixes**: two each of `0004`, `0005`, `0011`–`0019`, `0022`, `0023`, `0051`, `0052`, `0054`–`0063`, and a **gap at `0046`**. Apply-order currently relies on the full filename, which is fragile.

**Type safety (7.0)** — `export const appRouter = _appRouter as unknown as AppRouter` cast (needed for cold-build instantiation depth — see MEMORY note) plus **30 hand-maintained server-router type stubs** in `packages/api/src/routers/_types/server-router-types.ts` that drift from the real server routers; **~101 `any`** in backend code.

**Auth (7.5)** — `packages/api/src/context.ts` `createContext` **duplicates** the middleware's session+member lookup AND leaks **unconditional `console.log` on every authenticated request** at `context.ts:44`, `:49`, `:69`.

**Test coverage (8.0)** — combined `bun test:unit` is not green because Bun's `mock.module` is process-global (first-factory-wins per specifier); router-test subpath mocks collide with the barrel mock in `orpc-tenant.middleware.test.ts` + `payments.test.ts`. Individual files pass; combined run does not. An isolated per-file runner exists: `apps/server/scripts/run-integration-isolated.ts`.

### apps/native
Lower priority (not freshly rated). In scope only for opportunistic, low-risk wins surfaced while touching shared `packages/*`. Do NOT restructure native routing in this effort.

## Scope

**In scope:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/**` (the 6 god route files above + the 25-file LOC overage)
- `apps/web/src/components/pages/**`, `apps/web/src/features/**` (extraction targets)
- `apps/web/src/components/calendar/appointment.tsx` + commissions/refunds dialogs (invalidation fix)
- `apps/web/src/__tests__/**` (new unit tests for pos-workflow, members-tab, commission payouts)
- `packages/db/src/migrations/tenant/**` + `packages/db/src/generated/tenant-migrations.generated.ts` (renumber)
- `packages/api/src/context.ts` (auth dedup + console.log removal)
- `packages/api/src/routers/_types/server-router-types.ts` + `packages/api/src/routers/index.ts` (type-stub drift / cast)
- backend `any` reduction in `packages/api`, `packages/services`, `apps/server/src`
- `apps/server/src/tests/**` (mock isolation fix)

**Out of scope (do not touch):**
- `apps/web/src/routeTree.gen.ts` (auto-generated — Biome-ignored, never hand-edit)
- Any architecture migration suggestion (no Next.js/Convex/Clerk/REST/RHF) — Settled Decisions are locked
- `Done_*` zplan sessions
- Renaming migration files that are **already live** in production tenants without following the tenant-migration workflow (see Constraints) — renumbering must preserve apply order and stay idempotent
- `apps/native` routing/structure (opportunistic shared-package wins only)
- Production rollout scripts / live tenant data

## Tasks

> Organized into prioritized, parallelizable phases. Within a phase, agents own disjoint file sets and can run concurrently. Run the Verification gate between phases.

### Phase 1 — Web data-fetching standardization (1 agent, low-risk, do FIRST)
1. Replace all 51 hand-written string-key invalidations with `orpc.*.queryOptions(...).queryKey`. Start with the confirmed bugs: `components/calendar/appointment.tsx:143` and the commissions/refunds dialogs, then sweep the remaining sites. Cross-check each replacement against the actual query's `queryOptions` input so keys truly match.

### Phase 2 — Server auth + type-safety cleanup (2 agents, disjoint files)
2. **Agent A — auth:** In `packages/api/src/context.ts`, remove the unconditional `console.log` at lines 44/49/69 and de-duplicate the session+member lookup that the tenant middleware already performs (have `createContext` consume the middleware result rather than re-querying). Preserve exact context shape (`session`, `organizationId`, `tenantDb`, `member`, `accessibleNodeIds`).
3. **Agent B — types:** Reconcile the 30 server-router type stubs in `_types/server-router-types.ts` with the real server routers; eliminate drift. Investigate whether the `appRouter as unknown as AppRouter` cast can be narrowed/removed now (keep the cold-build instantiation-depth workaround if removal reintroduces the `MergedInitialContext` drift — see MEMORY). Reduce backend `any` count (~101) starting with the highest-traffic files. After editing stubs, rebuild `packages/api` (`cd packages/api && bun run build`) so web reads fresh `dist/index.d.ts`.

### Phase 3 — Tenant migration renumbering (1 agent, SOLO ownership of migrations/)
4. Renumber `packages/db/src/migrations/tenant/` to unique, gap-free sequential prefixes while strictly preserving current apply order (derive order from existing full filenames). Fill the `0046` gap or document it. Keep SQL idempotent. Then run `bun gen:migrations` and `bun verify:migrations` — commit the regenerated `tenant-migrations.generated.ts` alongside. NOTE: git autocrlf may flip LF→CRLF and break verify; just re-run `bun gen:migrations`.

### Phase 4 — Web god-component decomposition (parallel agents, ONE file each)
5. Decompose `pos/pos-workflow.tsx` (1791) into `components/pages/pos/*` thin-shell + sub-components. (highest risk — POS; preserve installment-plan amount display and commission-to-trainer rules)
6. Decompose `access-control/members-tab.tsx` (1508).
7. Decompose `appointment/class-slots/view.tsx` (1460), `reports/view.tsx` (1292), `announcements/view.tsx` (1211), `branch/view.tsx` (1129) — assign one agent per file. Continue the existing in-flight pattern already started for `sales/$id.tsx` and `settings/installment-plans.tsx`.

### Phase 5 — Web high-risk unit tests (parallel, after Phase 4 settles file paths)
8. Add unit tests for the decomposed `pos-workflow`, `members-tab`, and commission-payout components under `apps/web/src/__tests__/**`. Use the existing harness (`@/__tests__/helpers/mock-client.ts` mocks `@/utils/orpc`; `render-with-providers.tsx`).

### Phase 6 — Server combined-test isolation
9. Make `bun test:unit` green by resolving the process-global `mock.module` collisions (router subpath mocks vs the barrel mock in `orpc-tenant.middleware.test.ts` + `payments.test.ts`). Prefer the existing per-file isolated runner (`apps/server/scripts/run-integration-isolated.ts`) pattern over widening shared mock supersets (widening REGRESSES — see MEMORY).

## Verification

Run between phases and at the end:

- [ ] `bun check-types` — 0 errors across the monorepo
- [ ] `bun check` (oxlint) — clean
- [ ] Web: `cd apps/web && bun test` (vitest run) — all pass, including new pos/members/commission tests
- [ ] Server: individual files pass AND the isolated runner is green: `cd apps/server && bun run scripts/run-integration-isolated.ts` (and `bun test:unit` if Phase 6 lands the fix)
- [ ] `node scripts/ci/check-router-file-loc.mjs` — no router file > 400 LOC; spot-check the 6 decomposed web files are now under cap
- [ ] `bun verify:migrations` — generated module matches SQL files after renumber
- [ ] `grep` confirms 0 remaining hand-written string-key `invalidate:` sites in apps/web
- [ ] No `console.log` remains in `packages/api/src/context.ts`
- [ ] Functional spot-check (Chrome MCP at `http://avantej.localhost:3021/`): POS still shows installment amounts (not full price); commission still reaches trainers; a decomposed page (e.g. members-tab) renders and its mutations invalidate correctly

## Key References

| Resource | Path / Command |
|----------|---------------|
| Web god route files | `apps/web/src/routes/_authenticated/dashboard/_layout/{pos/pos-workflow,access-control/members-tab,appointment/class-slots/view,reports/view,announcements/view,branch/view}.tsx` |
| Extraction target dir | `apps/web/src/components/pages/<area>/`, `apps/web/src/features/` |
| Invalidation bug | `apps/web/src/components/calendar/appointment.tsx:143` |
| oRPC client | `apps/web/src/utils/orpc.ts` |
| Web test harness | `apps/web/src/__tests__/helpers/{mock-client,render-with-providers}.tsx` |
| Server context (auth) | `packages/api/src/context.ts` (lines 44/49/69) |
| Server-router type stubs | `packages/api/src/routers/_types/server-router-types.ts` |
| appRouter cast | `packages/api/src/routers/index.ts` |
| Tenant migrations | `packages/db/src/migrations/tenant/` + `packages/db/src/generated/tenant-migrations.generated.ts` |
| Mock collision tests | `apps/server/src/tests/.../{orpc-tenant.middleware,payments}.test.ts` |
| Isolated test runner | `apps/server/scripts/run-integration-isolated.ts` |
| LOC gate | `node scripts/ci/check-router-file-loc.mjs` |
| Type check | `bun check-types` |
| Web tests | `cd apps/web && bun test` |
| Migrations regen/verify | `bun gen:migrations` · `bun verify:migrations` |

## Constraints

- **No production code suggestions that violate Settled Decisions:** Vite + TanStack Router (no Next.js), Better-Auth (no Clerk), oRPC for all client→server (no REST), Drizzle (no Convex), TanStack Form for new forms (no RHF). Router files capped at 400 LOC.
- **Never hand-edit** `apps/web/src/routeTree.gen.ts`.
- **Tenant migrations:** never `bun db:push` for tenant schema; follow `docs/TENANT_MIGRATION_WORKFLOW.md`. SQL must stay idempotent (`CREATE TABLE IF NOT EXISTS`, etc.). Commit the regenerated `tenant-migrations.generated.ts` with the SQL change. Renumbering must preserve current apply order exactly.
- **Domain invariants — never break:** installment-plan amounts (not full price) must show in POS; commission must reach trainers in both rotation-queue and requested paths; multi-tenant isolation (tenant A never sees tenant B's data).
- **After editing `server-router-types.ts`:** rebuild `packages/api` (`cd packages/api && bun run build`) or web `check-types` fails on stale `dist` types.
- **Parallel-agent hygiene:** designate ONE owner per shared file (imports, `routers/index.ts`, schema barrels, migration dir). Run a cross-file conflict pass after each parallel phase — watch for import removals that conflict with another agent's additions.
- **Preserve context shape** when de-duplicating auth: `session`, `organizationId`, `tenantDb`, `member`, `accessibleNodeIds`.
- Do not run `git stash` or `git reset`. Do not amend existing commits.

## Agent Recommendation

**Suggested agents:** `general-purpose` orchestrator + parallel `frontend-engineer` agents (Phases 1, 4, 5) and `backend-engineer` agents (Phases 2, 3, 6).
**Why:** The work splits cleanly along web (TanStack/oRPC component + test work) and server (Drizzle migrations, oRPC context/types, Bun test isolation) lines, with disjoint file ownership per phase — ideal for parallel general-purpose agents coordinated by an orchestrator that runs the verification gate between phases. Codex subagents have been unreliable here; default to general-purpose.
