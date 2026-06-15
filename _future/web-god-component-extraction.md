# Web God-Component Extraction (remaining)

## Problem

Several `apps/web` route/component files are 1,000+ lines — large enough to be hard to navigate, test, and review. Three of the worst were extracted on 2026-05-29 into `features/*` modules (proven recipe below); the rest remain.

Remaining offenders (LOC as of 2026-05-29 — re-measure, a concurrent task was editing some):

| File | LOC | Shape |
|---|---|---|
| `components/pos/pos-workflow.tsx` | 1593 | ⚠️ monolithic — `PosWorkflow` is a single ~1,350-line stateful component |
| `components/pages/access-control/members-tab.tsx` | 1410 | ⚠️ monolithic — main component ~970 lines |
| `routes/.../appointment/class-slots/view.tsx` | 1395 | ⚠️ monolithic — `ClassSlotsPage` ~1,135 lines |
| `routes/.../platform-admin/tenants.$id.tsx` | 1219 | mixed |
| `routes/.../reports/view.tsx` | 1186 | mixed |
| `routes/.../announcements/view.tsx` | 1164 | mixed |
| `routes/.../dashboard/_layout/index.tsx` | 1149 | mixed |
| `routes/.../branch/view.tsx` | 1115 | mixed |
| `routes/.../audit/view.tsx` | 1081 | mixed |
| `components/pages/packages/instances-page.tsx` | 1072 | mixed |
| `components/customers/customer-profile-panel.tsx` | 887 | mixed |
| `routes/.../expenses/view.tsx` | 884 | mixed |
| `components/pages/services/promotions-page.tsx` | 884 | mixed |

## Why deferred

- The **monolithic** ones (pos-workflow, members-tab, class-slots) are NOT simple move/extract jobs — the bulk is one large stateful component with shared state/hooks. Extracting it safely means pulling logic into custom hooks + step/section subcomponents while preserving exact behavior — a careful refactor that needs its own planning pass, not a fire-and-forget move.
- There is **no CI LOC gate for web components**, so there's no automated pressure — purely maintainability debt.
- The 2026-05-29 sweep stopped after 3 because a concurrent audit-prove task spilled into `apps/web` and broke the web type-check, making per-extraction verification unreliable. Resume only on a clean, green tree.

## Proven recipe (for the "many-components" / mixed files)

This worked cleanly for `sales/view.tsx` (1310→361), `operations/approvals.tsx` (1680→316), `components/refunds/refunds-tab.tsx` (1240→416):

1. The file already contains many separate sub-components + types + helpers crammed together. Move each into `apps/web/src/features/<area>/`:
   - `<area>.types.ts`, `<area>.helpers.ts(x)`, `components/<Component>.tsx` (named exports).
2. Keep the main component + (for routes) the `Route` export in the original file as a thin shell that imports the extracted pieces.
3. **Behavior-preserving only** — move verbatim, adjust imports/exports, no logic/JSX/Tailwind/query-key/prop changes. Keep the exported symbol name/signature stable so importers don't break.
4. `noUnusedLocals` is ON — each new file imports exactly what it uses.
5. One focused subagent per file (it owns that file + its `features/<area>/` folder) — collision-free, keeps the main context clean.

## Out of scope

- The monolithic three (pos-workflow, members-tab, class-slots) under the simple recipe — they each need a dedicated hook-extraction plan first.
- Any behavior change.

## Acceptance criteria

- Target file reduced to a thin shell (main component/Route only); extracted modules under `features/<area>/`.
- `bunx turbo check-types --filter=web` green; the area's existing test (if any) passes.
- `bunx oxlint` 0 errors on the new files + shell.
- No behavior diffs.
