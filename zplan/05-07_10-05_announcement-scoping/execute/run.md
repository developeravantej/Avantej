# Execution Run: Announcement Branch Scoping

**Date:** 2026-05-07  
**Branch:** feat/package-approval-flow  
**Status:** COMPLETE

---

## Files Changed

| File | What changed |
|---|---|
| `packages/services/src/announcements.service.ts` | Full rewrite: added `buildScopeFilter` (EXISTS/NOT EXISTS query), `enrichWithScopes` (second-query pattern), `setAnnouncementScopes` helper; updated `listAnnouncements` + `listActiveAnnouncements` with `isAdmin` param + scope filter; updated `createAnnouncement` + `updateAnnouncement` with `scopedBranchIds` + wrapped in `tenantDb.transaction`; added `AnnouncementWithScopes` return type |
| `packages/api/src/routers/announcements.ts` | Added `scopedBranchIds` to `create` and `update` input schemas; added `isAdmin: context.member.role === "admin"` to `list` and `listActive` service calls |
| `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx` | Phase 1: added `scopedBranchIds?: string[]` to `AnnouncementRow` + passthrough in `filteredData` map. Phase 2: added `HierarchyNode` type + `useQuery` for `hierarchy.listNodes` (staleTime 5min); extended `FormState` with `scopedBranchIds: string[]`; updated `EMPTY_FORM`; updated `openEdit` to populate `scopedBranchIds`; updated `createMutation` + `updateMutation` to pass `scopedBranchIds`; replaced `branchId` Scope column with multi-scope renderer (Org-wide badge / names / truncated+count); added Branch Scope checklist in create/edit dialog |

---

## Key Design Decisions Applied

- **`buildScopeFilter`** returns `undefined` for admins (skip filter) or `notExists` (org-wide only) when `accessibleNodeIds` is empty. Drizzle `inArray(col, [])` crash guard is in place.
- **Admin bypass** (`isAdmin: context.member.role === "admin"`) prevents admins from seeing zero results if `accessibleNodeIds` errors to `[]`.
- **Transactions**: `createAnnouncement` and `updateAnnouncement` wrap both the announcement DML and `setAnnouncementScopes` in a single `tenantDb.transaction()` — same pattern as `appointment.service.ts`.
- **No-scope = org-wide**: `NOT EXISTS` branch ensures existing announcements (zero scope rows) remain visible to all.
- **`updateAnnouncement`**: if `scopedBranchIds` is `undefined` (not passed), scopes are NOT touched (partial update idempotency). If passed (including `[]`), scopes are replaced.

---

## Type Check Result

`bun check-types` output: all errors are pre-existing (bun:test module declarations, purchase-orders.test.ts, transfer-orders.test.ts, invitation.service.ts). Zero new errors from this change.

`bun check` (Biome): no new errors on changed files.

---

## Tests NOT Written (Recommended Follow-up)

Per Section 7 of the plan, the following tests were not written in this run:

**Unit tests** (`apps/server/src/tests/unit/announcements.service.test.ts`):
1. `listActiveAnnouncements` — org-wide announcement visible to any member
2. `listActiveAnnouncements` — Branch A-scoped announcement visible to Branch A member; invisible to Branch B
3. `listActiveAnnouncements` — admin sees all (isAdmin bypass)
4. `createAnnouncement` with `scopedBranchIds` — verifies rows in `announcement_scopes`
5. `updateAnnouncement` with `scopedBranchIds: []` — scopes cleared (org-wide)
6. `updateAnnouncement` without `scopedBranchIds` — existing scopes unchanged
7. `listAnnouncements` with `isAdmin: true, accessibleNodeIds: []` — admin bypass
8. `listAnnouncements` with `isAdmin: false, accessibleNodeIds: []` — org-wide only

**Integration tests** (`apps/server/src/tests/integration/announcements-scope.integration.test.ts`):
1. Create with scopes → listActive as Branch A member → present
2. Branch B member does NOT see Branch A-only announcement
3. Mixed: one org-wide + one Branch A-scoped → Branch A sees both; Branch B sees only org-wide
4. Update scopes: add Branch B → Branch B member now sees it
5. Clear scopes via `scopedBranchIds: []` → org-wide restored
