# Raise apps/web Code-Quality Rating (7.6 → target 8.5+)

> Handoff prompt generated 2026-06-09 · Branch: test/unit-suite-green-and-ci-fix · Project: Avantej

## Mission

Drive up the staff-engineer code-quality rating of `C:\Project\Avantej\apps\web` (currently **7.6/10**) by attacking its five lowest sub-scores: test coverage (6.0), component quality (6.5), error/UX edge states (7.0), architecture (7.5), and data-fetching consistency (7.5). Done means: highest-risk god-components have real unit tests, the worst route files are decomposed into thin shells + `components/pages/*`, loading/empty/error states are applied uniformly via existing primitives, and query invalidation is standardized on `orpc.*.queryOptions(...).queryKey`. `bun test` and `bun check-types` stay green throughout.

## Context

**Project:** Avantej — multi-tenant SaaS for gym/fitness-centre management (members, POS, installment plans, commissions, payouts).
**Stack (relevant to this task):** Vite + TanStack Router (file-based routing, `routeTree.gen.ts` is generated — never edit), oRPC client via `@/utils/orpc`, TanStack Query, Better-Auth, TanStack Form (NOT React Hook Form). Tests: Vitest + jsdom. RBAC via `useUserContext()`.
**Branch:** `test/unit-suite-green-and-ci-fix`
**Recent work (relevant):**
- Active push to get the unit suite green + fix CI (`.github/workflows/ci.yml` modified).
- In-flight decompositions already started: `sales/$id.tsx` and `settings/installment-plans.tsx` were slimmed (large deletions in `git diff`); new untracked dirs `components/pages/sales/` and `components/pages/settings/` exist — this is the decomposition pattern to follow.
- New untracked test `src/__tests__/components/commissions/review-tab.test.tsx` — consistent with the test-coverage push.

## Current State

- **51 test files** exist, but the **highest-risk components have ZERO unit tests**: `components/pos/pos-workflow.tsx` (**1791 LOC**, core POS flow), `components/pages/access-control/members-tab.tsx` (**1508 LOC**), and the commission **payouts** area.
- The vitest + jsdom harness is ready: `apps/web/vitest.config.ts`, `src/__tests__/helpers/render-with-providers.tsx` (QueryClient wrapper), `src/__tests__/helpers/mock-client.ts` (mocks `@/utils/orpc`). Reference tests already exist under `src/__tests__/components/ui/` (`empty-state.test.tsx`, `status-callout.test.tsx`).
- **25 route files exceed 400 LOC**, violating the thin-shell convention (CLAUDE.md: routes are thin context-extraction shells, logic lives in `components/pages/<area>/*`). Verified worst offenders:
  - `appointment/class-slots/view.tsx` — 1460
  - `reports/view.tsx` — 1292
  - `dashboard/_layout/index.tsx` — 1235
  - `platform-admin/tenants.$id.tsx` — 1219
  - `announcements/view.tsx` — 1211
  - `branch/view.tsx` — 1129
  - `audit/view.tsx` — 1099
  - (plus expenses 903, settings/tax-rates 830/831, onboarding 796, etc.)
- **Two competing query-invalidation conventions coexist.** ~20 sites hand-write string keys (e.g. `invalidateQueries({ queryKey: [["appointments"]] })` in `components/calendar/appointment.tsx`, also in `features/payouts/api.ts`, `platform-admin/bulk-actions-bar.tsx`, `reports/schedule-report-dialog.tsx`, `platform-admin/payments.tsx`, `commissions/bulk-action-bar.tsx`, `refunds/partial-refund-dialog.tsx`, `forms/hierarchical-branch-form.tsx`). The correct convention is `orpc.<router>.<proc>.queryOptions({ input }).queryKey`. The string-key form is the root of a class of stale-list bugs (mutate succeeds, list doesn't refresh).
- **Error/UX edge states are non-uniform**: ~91/153 page-area files handle loading/empty/error. Primitives already exist and are under-applied: `src/components/ui/empty-state.tsx`, `src/components/ui/status-callout.tsx`.

## Scope

**In scope (apps/web only):**
- New unit tests under `src/__tests__/` for the god-components and payouts.
- Decomposition of large route/component files into `src/components/pages/<area>/*` (and `src/components/features/*` where cross-area) with thin route shells.
- Standardizing query invalidation to `orpc.*.queryOptions(...).queryKey` at the ~20 string-key sites.
- Applying `EmptyState` / `StatusCallout` consistently to page-area files missing loading/empty/error handling.

**Out of scope (do not touch):**
- `apps/server`, `packages/*` — no backend, schema, or service changes. This is purely an `apps/web` quality uplift.
- `routeTree.gen.ts` (auto-generated).
- `.github/workflows/ci.yml` and the in-flight unrelated diffs already staged on this branch — don't revert or fold them in.
- No framework/library swaps: keep TanStack Router/Form, Better-Auth, oRPC, Drizzle. Do NOT introduce React Hook Form, Clerk, REST, or Next.js patterns.
- Do not change behavior/UX semantics while decomposing — pure structural moves; verify rendered output is unchanged.

## Tasks

Organize into prioritized phases. Within each phase, assign **one file-ownership boundary per parallel agent** so agents never edit the same file. Run phases sequentially; run agents within a phase in parallel.

**Phase 1 — Test coverage (highest ROI, lowest collision risk).** Each agent owns its own new test file(s); none edit shared production code.
1. Write unit tests for `components/pos/pos-workflow.tsx` covering the core POS flow: installment-plan amount display (must show installment amount, NOT full price), cart/total calc, and commission-reaches-trainer paths (rotation queue vs requested). Use `render-with-providers` + `mock-client`.
2. Write unit tests for `components/pages/access-control/members-tab.tsx`: list render, empty/loading/error states, role/permission-gated actions (mock `useUserContext`), invite/deactivate/role-update flows.
3. Write unit tests for the commission **payouts** area (`features/payouts/*` and the payouts page component): batch list, status transitions, invalidation-on-mutation.

**Phase 2 — Data-fetching standardization (mechanical, well-bounded).** Partition the ~20 string-key sites across agents by file; one agent per file, no overlap.
4. Replace every hand-written `queryKey: [["..."]]` invalidation with `orpc.<router>.<proc>.queryOptions({ input }).queryKey` (or migrate to `useApiMutation`'s `invalidate:` array using the same `.queryKey`). Start with `components/calendar/appointment.tsx`, then `features/payouts/api.ts`, `platform-admin/{bulk-actions-bar,payments}.tsx`, `reports/schedule-report-dialog.tsx`, `commissions/bulk-action-bar.tsx`, `refunds/partial-refund-dialog.tsx`, `forms/hierarchical-branch-form.tsx`. Confirm the list actually refreshes after the mutation in each case.

**Phase 3 — Architecture decomposition (highest collision risk — strict file ownership).** Follow the established pattern (`components/pages/sales/`, `components/pages/settings/` already created this branch). One agent per route file; each owns its route shell + the new `components/pages/<area>/*` it creates.
5. Decompose `appointment/class-slots/view.tsx` (1460) → thin shell + `components/pages/class-slots/*`.
6. Decompose `reports/view.tsx` (1292) → thin shell + `components/pages/reports/*`.
7. Decompose `announcements/view.tsx` (1211) → thin shell + `components/pages/announcements/*`.
8. Decompose `branch/view.tsx` (1129) → thin shell + `components/pages/branch/*`. (Defer `dashboard/_layout/index.tsx`, `platform-admin/tenants.$id.tsx`, `audit/view.tsx` to a follow-up batch if time-boxed.)

**Phase 4 — UX edge-state uniformity.** Owns only files NOT touched in Phase 3 to avoid collisions.
9. Sweep page-area files lacking loading/empty/error handling and apply `EmptyState` (`@/components/ui/empty-state`) and `StatusCallout` (`@/components/ui/status-callout`) consistently. Prioritize list/detail pages users hit daily.

## Verification

Run after EACH phase, and a final pass at the end:

- [ ] `cd apps/web && bun test` — full Vitest suite green (no regressions; new tests pass).
- [ ] `bun check-types` — 0 type errors across the monorepo.
- [ ] Phase 1: new test files exist for pos-workflow, members-tab, payouts and actually assert the domain invariants (installment amount shown, commission reaches trainer).
- [ ] Phase 2: zero remaining `queryKey: [["` string-key invalidations in `apps/web/src` (grep to confirm); each migrated mutation refreshes its list.
- [ ] Phase 3: each decomposed route file is now a thin shell (< ~120 LOC, context extraction only); logic moved to `components/pages/<area>/*`; rendered UI unchanged (spot-check in browser at `http://avantej.localhost:3021/`).
- [ ] Phase 4: targeted pages render distinct loading / empty / error UI via the shared primitives.
- [ ] Conflict check: after parallel agents, diff all modified files for import removals that clash with other agents' additions (per Agent Coordination rules).

## Key References

| Resource | Path / Command |
|----------|---------------|
| POS god-component | `apps/web/src/components/pos/pos-workflow.tsx` |
| Members god-component | `apps/web/src/components/pages/access-control/members-tab.tsx` |
| Payouts feature | `apps/web/src/features/payouts/*` |
| Test harness (providers) | `apps/web/src/__tests__/helpers/render-with-providers.tsx` |
| Test harness (orpc mock) | `apps/web/src/__tests__/helpers/mock-client.ts` |
| Reference unit tests | `apps/web/src/__tests__/components/ui/{empty-state,status-callout}.test.tsx` |
| Empty/error primitives | `apps/web/src/components/ui/{empty-state,status-callout}.tsx` |
| String-key invalidation example | `apps/web/src/components/calendar/appointment.tsx` |
| Decomposition pattern (in-flight) | `apps/web/src/components/pages/{sales,settings}/` |
| Run web tests | `cd apps/web && bun test` |
| Type check | `bun check-types` |

## Constraints

- **apps/web only** — no `packages/*` or `apps/server` edits, no schema/migration work.
- **Never edit `routeTree.gen.ts`** (auto-generated by TanStack Router).
- **No `git stash` / `git reset`** (any variant) — per global rules.
- **Settled Decisions are locked:** Vite + TanStack Router (not Next.js), Better-Auth (not Clerk), oRPC via `@/utils/orpc` (not REST), Drizzle (not Convex), TanStack Form (not RHF). Do not introduce competing patterns.
- **Data fetching:** queries use `orpc.*.queryOptions()`; mutations call `client.*` inside `useMutation`/`useApiMutation`; invalidation keys come from `orpc.*.queryOptions(...).queryKey` — never hand-written string arrays.
- **RBAC:** check permissions with `useUserContext()` (`hasPermission`/`hasRole`), not `usePermissions()`.
- **Mutations with toast/invalidation:** prefer `useApiMutation` from `@/hooks/useApiMutation`.
- **Decomposition is structural only** — preserve behavior and UX; no opportunistic logic rewrites.
- **Router files capped at 400 LOC** (CI-enforced) — decomposed shells must land well under this.
- Do NOT produce production code in THIS session — this file is the handoff; the receiving session executes it (e.g. via `/execute`).

## Agent Recommendation

**Suggested agent:** `general-purpose` (orchestrator) fanning out to parallel `general-purpose` sub-agents — one per file-ownership boundary per phase.
**Why:** The work is broad, parallelizable, and split cleanly by file; per CLAUDE.md, Codex sub-agents have been unreliable here, so default to `general-purpose` with strict file ownership and a post-phase conflict check.
