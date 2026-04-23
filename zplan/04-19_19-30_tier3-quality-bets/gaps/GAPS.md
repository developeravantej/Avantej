# Swarm Audit — GAPS.md
**Session:** 04-19_19-30_tier3-quality-bets
**Run at:** 2026-04-22T21:15:00+08:00
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 30 (1 critical · 12 high · 10 medium · 6 low · 1 info)

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| C1 | doc-consistency | `inventory-options-dashboard.tsx` cited at lines 61–202 but file is 27 lines — Phase 3.3 task 3.3.2 is unexecutable | `plan/plan.md` §3.6 table row 3 | Remove row 3; find actual mutation sites in `BrandsTabPage`/`SuppliersTabPage` subcomponents |

---

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| H1 | type-safety | `@sentry/react` not installed — Phase 3.1 fails at import time | `apps/web/package.json` | Run `bun add @sentry/react` from `apps/web/` before any Phase 3.1 code |
| H2 | scalability | `invalidateQueries` bare `.key()` misses parameterized queries — mutations won't refresh UI | `invitations-page.tsx:79,113,232`, `customer-detail-sheet.tsx:264,267`, `bulk-action-bar.tsx` | Use `exact: false` or pass params to `.key(params)` at each call site |
| H3 | scalability | Bulk lazy-route migration risks `routeTree.gen.ts` corruption during simultaneous file watch | `apps/web/vite.config.ts`, `routeTree.gen.ts` | Stop `bun dev` watcher before bulk rename; restart after all 46 renames complete |
| H4 | doc-consistency | Q2 Sentry DSN owner still unassigned — explicit `/execute` blocker | `plan/plan.md:676` | Assign owner before Phase 3.1; fill in Q2 owner field |
| H5 | doc-consistency | Q5 better-auth `twoFactor` API unverified — all §3.10 code samples may be wrong | `plan/plan.md` §3.10, §8 Q5 | Add task 3.6.0: check `node_modules/better-auth` two-factor exports; update §3.10 if API differs |
| H6 | api-surface | `orpc.commissions.list.key()` in §6 should be `orpc.commissionSplits.list.key()` | `plan/plan.md` §6 line ~607 | s/commissions/commissionSplits/ in §6 Impact section |
| H7 | api-surface | `hierarchical-branch-form.tsx` is not an invalidateQueries offender — `useUserContext` uses its own non-oRPC key | `plan/plan.md` §3.6 table | Remove that row; the `["user-context"]` key is correct as-is |
| H8 | schema-drift | Phase 3.6 `bun db:generate` requires `auth.ts` to be updated first — `twoFactor` table and `twoFactorEnabled` field both absent | `packages/db/src/schema/auth.ts` | Add prerequisite step 3.6.0a: update `auth.ts` with `twoFactor` table + `twoFactorEnabled` user field before code generation |
| H9 | test-coverage | `showMutationToast` utility — zero automated coverage for non-trivial error-message extraction logic | `apps/web/src/lib/toast.ts` (planned) | Add `apps/web/src/__tests__/lib/toast.test.ts` |
| H10 | test-coverage | `formatDateMYT` timezone utility — zero coverage for midnight-boundary and UTC offset bugs | `apps/web/src/lib/date.ts` (planned) | Add `apps/web/src/__tests__/lib/date.test.ts` |
| H11 | test-coverage | `useUnsavedGuard` hook — zero coverage; `isDirty` branch logic untested | `apps/web/src/hooks/useUnsavedGuard.ts` (planned) | Add `apps/web/src/__tests__/hooks/useUnsavedGuard.test.ts` |
| H12 | test-coverage | `DashboardErrorBoundary` — zero coverage; Sentry call on error boundary untested | `apps/web/src/components/error-boundaries/DashboardErrorBoundary.tsx` (planned) | Add `apps/web/src/__tests__/components/DashboardErrorBoundary.test.tsx` |

---

### P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| M1 | schema-drift | Task 3.6.2 says "Run `bun db:generate` if..." — conditional implies it may not be needed, but it IS required | `plan/plan.md` Phase 3.6.2 | Rewrite as 3-step task: edit auth.ts → `bun db:generate` → `bun db:migrate` |
| M2 | api-surface | `unitsOfMeasure` procedure name verified — remove "(verify exact procedure name)" qualifier | `plan/plan.md` §3.6 row 6 | Remove the uncertainty note; procedure is `orpc.unitsOfMeasure.list.key()` ✓ |
| M3 | api-surface | `better-auth/client/plugins` export path for `twoFactorClient` unverified | `apps/web/src/lib/auth-client.ts` | Before Phase 3.6.3: run `node -e "require('better-auth/client/plugins')"` to confirm export |
| M4 | test-coverage | Phase 3.5 lazy route migration — only manual type-check; no test for chunk loading | `plan/plan.md` Phase 3.5.6 | Add Playwright smoke test: navigate to 3 split routes, assert no console errors |
| M5 | test-coverage | Phase 3.3 `invalidateQueries` fix — no test that queries actually re-fetch after mutation | `bulk-action-bar.tsx`, `invitations-page.tsx` | Add RTL integration test: trigger mutation, assert query cache is invalidated |
| M6 | doc-consistency | `inventory-options-dashboard.tsx` misidentification also recorded in `audit/applied.md` | `zplan/.../audit/applied.md` | Update applied.md to note the correction |
| M7 | doc-consistency | Q6 (`useBlocker` installed version) undocumented — plan audited vs 1.114.25, installed is 1.167.4 | `plan/plan.md` §3.7, §8 Q6 | Update API note to "verified against v1.167.4"; mark Q6 Resolved: YES |
| M8 | type-safety | `useBlocker` plan baseline is v1.114.25 but installed is v1.167.4 — 53-version delta unreviewed | `apps/web/package.json:40` | Scan TanStack Router CHANGELOG 1.114→1.167 for `useBlocker` changes before Phase 3.4 |
| M9 | type-safety | `execSync` in `vite.config.ts` throws in shallow CI clones / Docker builds without git | `apps/web/vite.config.ts` | Wrap in try-catch with fallback: `process.env.VITE_GIT_SHA ?? "unknown"` |
| M10 | scalability | Bundle size gate (250 kB) set without baseline measurement — threshold may be wrong | `apps/web/package.json`, `bundle-baseline.md` (missing) | Run `bun build` pre-migration, record main chunk size, then set gate at ~40% of that |

---

### P4 — Low / Info

- **test-coverage [LOW]** — Sentry DSN `initSentry()` not tested for empty string or invalid DSN edge cases. Add 2 tests to `sentry.test.ts`.
- **doc-consistency [LOW]** — Timezone file list (§3.7.2) is a point-in-time snapshot; re-grep instruction already present. Promote re-grep to a numbered task (3.7.0) so it isn't skipped.
- **type-safety [LOW]** — `Intl.DateTimeFormat` lib availability is implicit; add `"lib": ["ESNext", "DOM", "DOM.Iterable"]` to `tsconfig.json` explicitly.
- **type-safety [LOW]** — `opts` spread in `formatDateMYT` silently overrides default format options; add JSDoc note.
- **type-safety [LOW]** — Pre-existing `as any` casts in `app-sidebar.tsx:287` and `useAuth.ts:88` (files touched by Phase 3.1). Opportunistic cleanup only.
- **scalability [LOW]** — DataTable `onKeyDown` keyboard nav should be gated on pagination being active; safe for now under 10-row pages.
- **api-surface [INFO]** — `twoFactorClient` import not yet in `auth-client.ts`; expected Phase 3.6 deliverable, not a current gap.
- **scalability [MEDIUM]** — Sentry `tracesSampleRate: 0.1` may exceed transaction quota; start at 0.01 and adjust.

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 0 | 1 | 1 | 0 | 0 | 🟡 needs-attention |
| api-surface | 0 | 2 | 1 | 0 | 1 | 🟡 needs-attention |
| test-coverage | 0 | 4 | 2 | 1 | 0 | 🟡 needs-attention |
| doc-consistency | 1 | 2 | 2 | 1 | 0 | 🔴 critical |
| type-safety | 0 | 1 | 2 | 3 | 0 | 🟡 needs-attention |
| scalability | 0 | 2 | 2 | 1 | 0 | 🟡 needs-attention |
| **TOTAL** | **1** | **12** | **10** | **6** | **1** | **🔴 critical** |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P1 (C1) + P2 plan text fixes (H6, H7, M2, M7) | `plan/plan.md` only | ~600 | 5 Edit calls, all mechanical text changes |
| H4 Q2 owner assignment | `plan/plan.md` | ~100 | Fill in one field |
| H8 + M1 (auth.ts prereq step + task rewrite) | `plan/plan.md` | ~400 | Rewrite Phase 3.6.2 task text |
| H5 + M3 + M8 (API verification tasks) | `plan/plan.md` | ~500 | Add task 3.6.0, update Q5/Q6 |
| H2 scalability fix (invalidateQueries `exact: false`) | 3–5 component files | ~1,500 | Code change in each mutation site |
| H3 scalability fix (migration guide update) | `plan/plan.md` Phase 3.5.3 | ~300 | Add stop-watcher instruction |
| H1 (install @sentry/react) | `apps/web/package.json` | ~100 | `bun add @sentry/react` |
| H9–H12 (4 new test files) | 4 new test files | ~6,000 | New vitest test files for each utility |
| M9 (execSync try-catch) | `vite.config.ts` | ~200 | Wrap one expression |
| M10 (bundle baseline + gate) | `plan/plan.md`, run build | ~400 | Update §2 + Phase 3.5.2 |
| **Total for P1+P2** | | **~10,200** | |
| **Total for P3** | | **~3,000** | |

---

## Auto-fixable findings

Purely mechanical — safe to apply to `plan/plan.md` without human judgment.

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| A1 | api-surface | `orpc.commissions.list.key()` → `orpc.commissionSplits.list.key()` | `plan/plan.md` §6 line ~607 | Edit: replace the router name |
| A2 | api-surface | `unitsOfMeasure` — remove "(verify exact procedure name)" note | `plan/plan.md` §3.6 table row 6 | Edit: remove the parenthetical |
| A3 | api-surface | Remove `hierarchical-branch-form.tsx` from §3.6 offenders table | `plan/plan.md` §3.6 table | Edit: delete or rephrase the row |
| A4 | doc-consistency | Q6 update: mark Resolved: YES, add "verified against v1.167.4" | `plan/plan.md` §3.7 API note, §8 Q6 | Edit: two text changes |
| A5 | schema-drift | Rewrite Phase 3.6.2 as 3-step task (edit auth.ts → db:generate → db:migrate) | `plan/plan.md` Phase 3.6.2 | Edit: expand one bullet into three |
| A6 | scalability | Add stop-watcher instruction to Phase 3.5.3 | `plan/plan.md` Phase 3.5.3 | Edit: insert one sentence before the bulk-rename instruction |
| A7 | doc-consistency | Promote timezone re-grep from parenthetical to numbered task 3.7.0 | `plan/plan.md` Phase 3.7.2 | Edit: add "3.7.0" as a new numbered task |
