# Plan 2 — Members/Packages: legacy removal + type-safety

**Agent scope:** members/customers/packages domain only. Read [00-orchestration.md](00-orchestration.md) shared conventions first.

## Goal
Retire the legacy customers page in favor of v2, close the type-safety holes at the packageInstances API boundary, derive `canWrite` from real permissions, and add the missing installment-plan-setup e2e.

## User journeys affected
- **Staff opens Customers:** today two routes exist — legacy `/customers` (linked from the sidebar, uses `members.list`, `any`-typed) and the canonical v2 directory. After this plan there is ONE customers surface: the v2 page, reachable from the same sidebar entry where the old one was (same place, per planning rule — do not relocate the entry point).
- **Manager edits a member's packages from the customer profile:** v2 packages tab currently lets ANYONE write (`canWrite={true}` hardcoded). After fix, write actions respect the user's actual permission.
- **Admin configures installment plans** (settings) → sells a package on installment: setup flow gets e2e proof.

## Tasks

### Task 1 — Remove legacy customers page
- Delete `apps/web/src/components/pages/customers/CustomersListPage.tsx` (the legacy one — verify exact path/name first) and the orphaned `customer-row.tsx` (`CustomerRow` — confirmed imported nowhere).
- Route `apps/web/src/routes/_authenticated/customers.tsx`: replace its body with a redirect to the v2 customers route (match the `makeTabRedirect` pattern used by other legacy routes) — do NOT delete the route file itself (external links/bookmarks may target it).
- `apps/web/src/components/app-sidebar.tsx` (verified: links to `/customers`): point the sidebar entry at the v2 route directly.
- Grep the ENTIRE codebase for `CustomersListPage` and `CustomerRow` imports and any `to="/customers"` links before declaring done (per global rule on shared UI references).

### Task 2 — Fix API-boundary type casts
- `memberships-page.tsx:206` and `customers/v2/packages-tab.tsx:398`: `packageInstances.listMemberships` accessed via `as unknown as`. Root-cause first: this is usually the **stale api dist types** problem (see memory: web check-types reads BUILT `packages/api` dist). Rebuild `packages/services` then `packages/api`; if the procedure type then flows, delete the casts. If the procedure genuinely isn't exported in the client type, fix the router type export instead (folder-module import-path gotcha: builders from `"../../index"`).
- `instances-page.tsx:397`: `as any` on `packageInstances.create` payload — type the payload against the procedure input; fix the payload shape rather than widening types.

### Task 3 — Derive canWrite in v2 packages-tab
- `customers/v2/packages-tab.tsx:579`: replace hardcoded `canWrite={true}` with a `useUserContext().hasPermission(...)` check. Find the exact permission string by reading what the standalone packages pages gate on (likely `package_management:update` or similar — verify in `instances-page.tsx` / guards usage, do not guess).
- Add/extend a unit test asserting write controls hidden without the permission.

### Task 4 — E2E: installment plan setup
- New spec: `_e2e/web/settings/installment-plan-setup.lifecycle.spec.ts` (settings module folder already exists; this plan adds ONE file there — no other plan touches `_e2e/web/settings/`... note Plan 5 adds `_e2e/web/email-domains/` as its own folder, so no collision).
- Journey: create plan via `installmentPlans.create` → assert it appears in POS package-sale flow options (`installmentPlans.list`) → setDefault → deactivate → assert deactivated plan no longer offered.

### Task 5 (stretch, only if Tasks 1–4 green) — Client picker for package-instance create
- `instances-page.tsx:812` requires pasting a raw client user UUID. Replace free-text with a search-select backed by `customerDirectory.list`. **Reminder:** the value passed must be `member.userId` (Better-Auth nanoid, NOT a UUID — do not add `.uuid()` validation) per memory `project_pos_customer_id_is_userid` / `project_members_userid_not_uuid`.

## Files owned
- `apps/web/src/components/pages/customers/**` (legacy files only — v2 files may be edited ONLY for packages-tab.tsx and its test)
- `apps/web/src/routes/_authenticated/customers.tsx`, `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/pages/packages/instances-page.tsx`, `memberships-page.tsx`
- New: `_e2e/web/settings/installment-plan-setup.lifecycle.spec.ts`, unit tests it adds

## Risks
- Sidebar edit is shared-visible: ONLY change the customers entry, nothing else in that file.
- Deleting the legacy page: run a full-codebase grep for every symbol before removal; the audit found it unreferenced except route+sidebar, but re-verify at execution time.
- Task 2 may reveal the cast exists because of a real router type gap — if fixing requires touching `packages/api` beyond a rebuild, report back before editing (potential overlap with Plan 1 Task 1).

## Verification
1. `bun check-types` (rebuild services→api first if router types touched) — the two `as unknown as` casts and the `as any` are GONE (grep to confirm).
2. `cd apps/web && bun run test`.
3. Browser: sidebar Customers → lands on v2; old `/customers` URL redirects; profile packages tab hides write actions for a staff user without the permission.
4. Run the new installment-plan-setup spec.
