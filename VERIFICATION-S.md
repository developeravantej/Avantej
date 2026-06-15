# Plan F.1 — Agent S: Cross-Tenant ⌘K Search Palette

## Scope
Platform-admin ⌘K (Ctrl+K) command palette. Cross-tenant search by org id /
name / slug / member email, with ranked + deduped results, navigating to the
tenant drill-in route.

## Files created
- `apps/server/src/routers/platform-admin-tenants-search.ts`
- `apps/web/src/components/platform-admin/command-palette.tsx`
- `apps/web/src/hooks/use-command-palette.ts`
- `apps/web/e2e/tests/ship/plan-f-1/S-search-palette.spec.ts`
- `verification/plan-f-1/S-search-palette.webm`
- `VERIFICATION-S.md`

## Files patched
- `apps/server/src/index.ts` — import + mount
  `search: platformAdminTenantsSearchRouter` under `platformAdminTenants`.
- `packages/api/src/routers/index.ts` — added
  `platformAdminTenantsSearchRouterType` type stub and mounted under
  `platformAdminTenants.search` for client type inference.
- `apps/web/src/routes/_authenticated/dashboard/_layout.tsx` — mounts
  `<CommandPalette />` gated by `pathname.startsWith('/dashboard/platform-admin')`.

## Backend design
Single proc `search` on `platformAdminTenants.search`:
- Input: `{ query: string(1..200), limit: int(1..20, default 10) }`.
- Auth: any platform-admin role (super_admin / support / billing). Read-only,
  no audit row.
- UUID regex on the trimmed query → exact `organizations.id` lookup (rank `id`).
- Otherwise ILIKE on `organizations.slug` and `organizations.name` (one query),
  classifies match per row (slug > name).
- ILIKE on `user.email`, then joins `organization_members` → `organizations`
  for email matches.
- Dedupe by `orgId` keeping the lowest-rank `matchType`, then sort by rank +
  name. Returns `Array<{ orgId, orgName, slug, matchType, matchedField? }>`.

## Frontend design
- `useCommandPaletteHotkey()` — global `keydown` listener on `document` toggles
  open state on `(Meta|Ctrl)+K`. Idempotent module-level refcount.
- `useCommandPaletteState()` — `useSyncExternalStore` over module-level state;
  no zustand dependency (repo has none).
- `CommandPalette` — `cmdk` `Command*` primitives wrapped in shadcn `Dialog`.
  - Autofocus input, 250ms debounce, single in-flight RPC via `reqIdRef`.
  - States: empty hint, loading spinner, error, no-results, ranked rows with
    match-type badge + slug/email subtitle.
  - Row click → `navigate({ to: '/dashboard/platform-admin/tenants/$id' })`.
  - ESC closes via Dialog/cmdk built-ins.

## Playwright result
Spec: `apps/web/e2e/tests/ship/plan-f-1/S-search-palette.spec.ts` (`@ship-f-1`).

Command:
```
cd apps/web && bun playwright test e2e/tests/ship/plan-f-1/S-search-palette.spec.ts --grep @ship-f-1
```

Result: **1 passed (24.4s)**.

Scenarios in the single test:
1. Golden — login as super_admin → `/dashboard/platform-admin/tenants` → ⌘K
   opens palette → fills org-name substring → row appears → click → URL
   becomes `/dashboard/platform-admin/tenants/<orgId>` → palette closes.
   **PASS**.
2. Empty hint + "No matches" + ESC closes. **PASS**.
3. Pathname gate — at `/dashboard` (NOT `/dashboard/platform-admin/...`) ⌘K
   does not surface a `[data-testid=command-palette]`. **PASS**.
4. Match-type ranking via RPC — querying the exact UUID returns `matchType:
   "id"` first; querying a slug substring returns the sample org and every
   row's match-type rank is monotonic non-decreasing (id < slug < name <
   email). **PASS**.
5. RBAC negative — skipped per spec (read-only proc; all admin roles see the
   same data, single super_admin storage-state available).

Video: `verification/plan-f-1/S-search-palette.webm` (~452 KB, 463,364 bytes).

## Pre-existing issues hit
- `platformAdminTenants.listTenants` aggregation cast bug (`cannot cast type
  record to uuid[]` on `org_country_stripe_accounts` rollup) still fires on
  the `/dashboard/platform-admin/tenants` page render. This is the documented
  out-of-scope listTenants bug from sibling F.1 runs. It does NOT affect the
  palette: the palette mounts on the layout independent of the list query,
  and the search proc never touches that aggregation path.
- `bun check-types` workspace command surfaces pre-existing errors in
  `apps/server/src/services/saas-subscription.service.integration.test.ts`,
  `webhook-dedupe.service.integration.test.ts`, and
  `apps/server/src/tests/integration/org.test.ts` (sub `stripePriceId/
  applicationFeeBps` shape drift). None reference my new files; my files
  type-check clean under both `apps/server` and `apps/web` `tsc --noEmit`.

## Deviations
- No `command.tsx` shadcn primitive in the repo; built the palette directly on
  top of `cmdk` `Command*` exports inside `command-palette.tsx`, wrapped in
  the existing shadcn `Dialog`. Avoids interactive `bunx shadcn add`.
- Used `useSyncExternalStore` + module-level state instead of installing
  Zustand (none in the codebase).
- RBAC negative scenario skipped per spec since the proc is read-only and a
  separate persona provision is gratuitous; documented in this report.

## Pre-declared symbol check
- Server: `export const platformAdminTenantsSearchRouter = { ... }` — present.
- Client type stub: `platformAdminTenantsSearchRouterType: typeof
  platformAdminTenantsSearchRouter` (matching shape) — present in
  `packages/api/src/routers/index.ts` and mounted as
  `platformAdminTenants.search`.

## Constraints respected
- No new migration; no new DB tables (uses `organizations`, `user`,
  `organization_members` only).
- No `git commit` / `git push` performed.
- No edits outside the owned + PATCH file list.
