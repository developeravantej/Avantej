# Document Consistency Audit — Pass 2

## Changes since Pass 1
- DC-06: `new Map<string, string[]>()` fix applied ✓
- DC-04: test file name fixed to `.integration.test.ts` ✓

---

## Re-check of DC findings

### DC-06: scopeMap syntax — RESOLVED ✓
Plan now shows `const scopeMap = new Map<string, string[]>();` with full loop body.

### DC-04: Test file naming — RESOLVED ✓
Plan now references `announcements-scope.integration.test.ts`.

---

## New finding P2-DC-01: buildScopeFilter references `announcements` without explaining context — MEDIUM

The plan's `buildScopeFilter` function references `announcements.id` but `announcements` is not a parameter of the function:
```typescript
function buildScopeFilter(
  tenantDb: TenantDb,
  isAdmin: boolean,
  accessibleNodeIds: string[],
) {
  ...
  .where(eq(announcementScopes.announcementId, announcements.id))
```

`announcements` here refers to the module-level import of the `announcements` Drizzle table. TypeScript resolves this via closure/module scope. This is valid but the function signature makes it look like `announcements` is an undefined reference.

**Recommendation:** Either add `announcements` as a parameter:
```typescript
function buildScopeFilter(
  tenantDb: TenantDb,
  isAdmin: boolean,
  accessibleNodeIds: string[],
  table: typeof announcements,  // pass the table ref
)
```
Or add a comment clarifying it uses the module-scoped import. The latter is simpler.

---

## New finding P2-DC-02: Phase 1 verification step not updated for isAdmin — MEDIUM

Plan §5 Phase 1 verification:
> "Manual API call: create announcement with `scopedBranchIds: [branchAId]`; call `listActive` as a member outside Branch A's scope; confirm announcement is absent."

The verification does not include: "Call `list` as an admin; confirm scoped announcements appear." Without this, an implementor could ship with a broken `isAdmin` path and the verification would not catch it.

**Required addition to verification:**
- "Call `list` as an admin; confirm ALL announcements (including Branch A-scoped) appear."
- "Call `list` as a staff member outside Branch A; confirm Branch A-scoped announcements do NOT appear."

---

## New finding P2-DC-03: Phase 2 Task 2.2 `openEdit` call not updated — LOW

Plan Task 2.2 says:
> "Update `openEdit` to populate `scopedBranchIds` from `row.scopedBranchIds ?? []`."

But Task 1.8b (added in Pass 1) adds `scopedBranchIds?: string[]` to `AnnouncementRow` in Phase 1. In Phase 2, Task 2.2 extends `FormState` to add `scopedBranchIds: string[]`. The flow is:
1. Phase 1: `AnnouncementRow.scopedBranchIds?: string[]` (optional, from API)
2. Phase 2: `FormState.scopedBranchIds: string[]` (required in form)
3. Phase 2: `openEdit` sets `form.scopedBranchIds = row.scopedBranchIds ?? []`

The `??` handles the `undefined` case from the optional Phase 1 field. This is correct. No issue.

---

## New finding P2-DC-04: File Change Summary missing view.tsx Phase 1 change — RESOLVED ✓

Pass 1 fix (Task 1.8b) added the Phase 1 frontend change to the File Change Summary. The updated table shows "Phase 1: add `scopedBranchIds?: string[]`..." for `view.tsx`. ✓

---

## New finding P2-DC-05: Task 1.3 (setAnnouncementScopes) signature — missing tx type — LOW

Plan Task 1.3 shows `setAnnouncementScopes(tenantDb, announcementId, scopedBranchIds)` but the plan says to use `tenantDb.transaction(async (tx) => { ... })`. If the outer `createAnnouncement` / `updateAnnouncement` calls use a transaction, they need to pass `tx` (not `tenantDb`) to `setAnnouncementScopes`. The plan doesn't clarify whether `setAnnouncementScopes` accepts both `tenantDb` and `tx` (they have the same type in Drizzle), but the naming of the parameter as `tenantDb` inside `setAnnouncementScopes` is fine — the transaction object IS a `TenantDb` compatible type.

---

## Summary

| ID | Severity | New? | Action |
|---|---|---|---|
| P2-DC-02 | MEDIUM | Yes | Update Phase 1 verification steps in plan |
| P2-DC-01 | MEDIUM | Yes | Add comment to buildScopeFilter explaining module-scope `announcements` |
| P2-DC-03,04,05 | LOW | — | No action or already resolved |
