# Fix apps/web "Holding It Back" Review Findings

> Handoff prompt generated 2026-06-05 · Branch: test/unit-suite-green-and-ci-fix · Project: Avantej

## Mission

Resolve the 5 frontend code-quality findings that capped the `apps/web` review at 7/10: oversized god-components, `as any` type leakage from stale oRPC dist types, raw `useMutation` where `useApiMutation` is the convention, an off-spec auth pattern in `set-password.tsx`, and near-zero accessibility labeling. Done = each finding either fixed or explicitly deferred with a one-line rationale, `bun check-types` green, app still renders the affected pages.

## Context

**Project:** Avantej — multi-tenant SaaS for gym/fitness centre management (members, packages, POS, installments, commissions).
**Stack:** Vite + TanStack Router (file-based) + Better-Auth + oRPC + TanStack Query + shadcn/ui + Tailwind. See CLAUDE.md "Frontend Patterns" + "Stack Constraints".
**Branch:** test/unit-suite-green-and-ci-fix
**Recent work:**
- `db076f3e` fix(customers): directory list/stats 500 from JOIN fan-out overflow
- `4a1debc2` chore(e2e): module-grouped review suite + e2e staff seed
- This branch greened the unit/integration suites; review surfaced residual frontend debt.

## Current State

Frontend follows conventions in ~95% of cases (oRPC queryOptions, `useUserContext` permissions, `organizationId` threading all solid). The remaining debt:

1. **God-components breaking the thin-route rule** — `settings/installment-plans.tsx` (~967 LOC) inlines `PlanCard` (~lines 95–301), the create/edit form dialog (200+ LOC), and a deactivate dialog. `sales/$id.tsx` (~766 LOC) inlines `CancelSaleDialog`, `StatusHistoryCard`, `SalesStatusBadge`, and `mapReceiptResponse` alongside the page.
2. **`as any` / inline casts** signalling stale oRPC types — `commissions/review-tab.tsx:425` (`rawRows.map((r: any) => …)`), `sales/$id.tsx:476` (`order as { createdByName?: … }`) and `:621` (`order as { branchId?: … }`), `settings/google-calendar.tsx:134` (`orgStatusRaw as any`).
3. **Raw `useMutation`** where `useApiMutation` is the stated convention — `sales/$id.tsx:180`, `commissions/review-tab.tsx:452`.
4. **Off-spec auth in `set-password.tsx`** — raw `fetch()` (lines ~74, ~153) plus `localStorage.setItem` of an `access_token` (~line 102) that is written but never read; inconsistent with Better-Auth's cookie session model.
5. **Accessibility** — only ~6 `aria-label` occurrences across the entire `_layout` route tree; many icon/action buttons lack accessible labels (branch claimed a11y fixes).
6. **Stray `"use client"` directive** at `commissions/view.tsx:1` — a Next.js artefact, no effect in Vite.

## Scope

**In scope:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/review-tab.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx`
- `apps/web/src/routes/set-password.tsx`
- `apps/web/src/components/pages/**` (destination for extracted sub-components)
- `packages/api/src/routers/_types/server-router-types.ts` (only if a cast traces to a missing type stub — then rebuild api dist)

**Out of scope (do not touch):**
- `routeTree.gen.ts` (auto-generated)
- Any backend/service logic, schema, or migrations
- Data-fetching patterns that already follow convention (do not "improve" working queries)
- The auth server endpoints themselves — only fix the client usage in `set-password.tsx`

## Tasks

1. Extract `PlanCard` and the create/edit + deactivate dialogs out of `installment-plans.tsx` into `apps/web/src/components/pages/settings/installment-plans/` so the route file drops well under 400 LOC; verify no behavior change.
2. Extract `CancelSaleDialog`, `StatusHistoryCard`, `SalesStatusBadge`, and `mapReceiptResponse` out of `sales/$id.tsx` into `components/pages/sales/`; keep the route a thin shell.
3. Replace the `as any` / inline casts in `review-tab.tsx:425`, `sales/$id.tsx:476`+`:621`, `google-calendar.tsx:134` with real types. If the type is missing from the oRPC response, fix the server-router-type stub and `cd packages/api && bun run build` (web reads built dist types).
4. Convert the raw `useMutation` calls at `sales/$id.tsx:180` and `review-tab.tsx:452` to `useApiMutation` (toast + invalidate), matching the convention — unless a documented reason requires raw; if so, leave a one-line comment.
5. In `set-password.tsx`, remove the dead `localStorage.setItem(access_token)` and reconcile the raw `fetch` calls with Better-Auth; if the setup endpoint must stay raw HTTP, keep it but drop any token storage and add a comment explaining why it bypasses oRPC.
6. Remove the stray `"use client"` directive at `commissions/view.tsx:1`.
7. Add `aria-label` (or `aria-labelledby`) to icon-only / action buttons in the touched files at minimum; sweep the wider `_layout` tree for icon buttons lacking labels and add them where trivial.

## Verification

- [ ] `bun check-types` → 0 errors
- [ ] `bun check` (oxlint) clean on touched files
- [ ] `installment-plans.tsx` and `sales/$id.tsx` each under 400 LOC
- [ ] No remaining `as any` in the four cited locations (`grep -n "as any"` on the files)
- [ ] Manual: installment-plans page, a sales detail page, commissions review tab, set-password flow, and google-calendar settings all render and the primary action works (Chrome MCP at `http://avantej.localhost:3021/`)
- [ ] No `"use client"` remaining in `apps/web/src` (`grep -rn "use client" apps/web/src`)

## Key References

| Resource | Path / Command |
|----------|---------------|
| Frontend conventions | `CLAUDE.md` → "Frontend Patterns" |
| useApiMutation hook | `apps/web/src/hooks/useApiMutation.ts` |
| Permission hook | `apps/web/src/hooks/useUserContext.ts` |
| oRPC type stubs | `packages/api/src/routers/_types/server-router-types.ts` |
| Rebuild api types | `cd packages/api && bun run build` |
| Type check | `bun check-types` |
| Lint | `bun check` |

## Constraints

- Never edit `routeTree.gen.ts` by hand (auto-generated).
- Router/route files capped at 400 LOC (CI-enforced); extracted components live in `components/pages/<area>/`.
- Use `orpc.*.queryOptions()` for queries, `useApiMutation`/`client.*` for mutations — do not introduce raw REST.
- TanStack Form for any new form work (not React Hook Form).
- After editing `server-router-types.ts`, rebuild `packages/api` or web check-types fails on stale dist types.
- Behavior-preserving: extractions must not change rendered output or query keys.

## Agent Recommendation

**Suggested agent:** frontend-engineer
**Why:** Every task is React/TanStack/oRPC component refactoring and typing within `apps/web`, the agent's core domain.
