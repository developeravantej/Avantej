# API Surface Audit — Pass 1

## Source files checked
- `packages/api/src/routers/announcements.ts`
- `packages/api/src/routers/index.ts`
- `packages/services/src/announcements.service.ts`
- `packages/api/src/context.ts`
- `packages/db/src/schema/tenant/members.ts`

---

## Finding AS-01: announcements.listActive exists and is in baseRouter — CORRECT (LOW)

`announcementsRouter` is imported in `index.ts` and added to `baseRouter` as `announcements: announcementsRouter`. The `listActive` procedure exists and accepts:
```ts
{ organizationId: z.string().uuid() }
```
No additional params. The plan says Tasks 1.6/1.7 add `scopedBranchIds` to `create` and `update` only — `listActive` input schema stays the same. CORRECT.

---

## Finding AS-02: Admin bypass for scope filter is UNRESOLVED — CRITICAL

**Plan §8 Q2:** "When `context.member.role === 'admin'`, the `accessibleNodeIds` from context will be all nodes (or the service can check `isAdmin` and skip the EXISTS filter). The existing `listAnnouncements` already has a note about `accessibleNodeIds` in the params — when the router passes `context.accessibleNodeIds` for an admin, those IDs include all nodes, so the EXISTS filter naturally passes."

**Reality in production:** `packages/api/src/context.ts` calls `getDescendantNodeIds(tenantDb, member.hierarchyScopeId)` for ALL members regardless of role. Since `hierarchyScopeId` is NOT NULL for all members (DB constraint), admins who are scoped to the root HQ node will get ALL org nodes. The plan's claim is correct for production.

**Reality in test mocks:** `packages/server/src/tests/helpers/context.factory.ts` sets `accessibleNodeIds: []` for admin context with the comment `// Admin: empty means "all nodes"`. This is WRONG — after Phase 1, `listAnnouncements` with `accessibleNodeIds: []` will run the EXISTS filter and return ZERO scoped announcements (only org-wide). All new unit tests for admin scenarios using `createAdminContext()` will fail or produce wrong results.

**Impact:** Unit tests for admin `listAnnouncements` scope behavior will silently test the wrong scenario. Integration tests against real DB will be correct. The plan does not address this mock inconsistency.

**Required fix:** Either:
a) Update `createAdminContext()` to populate a realistic `accessibleNodeIds` (all known test node IDs), OR
b) Add `isAdmin: context.member.role === "admin"` param to service and skip the EXISTS filter — as the plan tentatively recommends in §8 Q2 but marks only as "Recommendation."

The plan must make a definitive decision on this path, not leave it as a recommendation.

---

## Finding AS-03: listActive does not pass memberType — MEDIUM

`listActive` router handler calls:
```ts
return listActiveAnnouncements(context.tenantDb, {
  accessibleNodeIds: context.accessibleNodeIds ?? [],
});
```
It does NOT pass `memberType`. The `listActiveAnnouncements` service accepts an optional `memberType` param for staff/clients filtering.

**Impact:** The home dashboard widget currently gets ALL announcements regardless of whether the member is staff or client. This is a pre-existing gap (not introduced by this plan). The plan does not address it. Flagging as MEDIUM since it means clients might see staff-only announcements and vice versa in the widget.

**Plan gap:** Task 2.6 says "no changes required" for the widget. True for scope changes, but the memberType gap pre-exists and is not mentioned.

---

## Finding AS-04: Return type change breaks existing callers — HIGH

**Plan Task 1.8:** `listAnnouncements` return type changes from `(typeof announcements.$inferSelect)[]` to include `scopedBranchIds: string[]` per row.

**Current callers in `view.tsx`:**
```tsx
const filteredData: AnnouncementRow[] = apiData.filter(...).map((item) => ({
  ...
  branchId: item.branchId ?? null,
  // scopedBranchIds NOT mapped — will be undefined after type change
}))
```

The `AnnouncementRow` type in `view.tsx` does not include `scopedBranchIds`. After Phase 1, the API returns `scopedBranchIds` but the frontend ignores it. This is OK at runtime but TypeScript strict mode will flag `item.scopedBranchIds` access before Phase 2 updates the type.

**Plan gap:** Plan mentions updating `AnnouncementRow` in Task 2.2 (Phase 2). But between Phase 1 and Phase 2, there will be a type mismatch. The plan should either:
a) Update `AnnouncementRow` in Phase 1 to include `scopedBranchIds?: string[]`, or
b) Acknowledge the transient type gap and gate it behind Phase 2.

`bun check-types` will fail between Phase 1 land and Phase 2 if `AnnouncementRow` is not updated. HIGH because it blocks Phase 1 verification step.

---

## Finding AS-05: listAnnouncements with accessibleNodeIds undefined vs empty — MEDIUM

Current `listAnnouncements` service:
```ts
if (accessibleNodeIds !== undefined) {
  conditions.push(or(inArray(...), isNull(...)!))
}
```

Empty array `[]` triggers `inArray(announcements.branchId, [])` which Drizzle compiles to `WHERE branch_id IN ()` — **a SQL syntax error in PostgreSQL**. However, the current `or(isNull(...), inArray(..., []))` pattern avoids this because the `isNull` branch always matches org-wide announcements. The new EXISTS/NOT EXISTS plan does NOT have this protection: `inArray(announcementScopes.branchId, accessibleNodeIds)` with empty array is a crash.

**Plan gap (Task 1.1, 1.2):** The plan's Drizzle snippet uses `inArray(announcementScopes.branchId, accessibleNodeIds)` inside the EXISTS subquery but does not guard against empty `accessibleNodeIds`. If `accessibleNodeIds = []`, the `inArray` will throw a Drizzle error.

**Required fix:** Guard the EXISTS branch:
```ts
const hasAccessibleNodes = accessibleNodeIds.length > 0;
or(
  notExists(...),
  hasAccessibleNodes ? exists(
    tenantDb.select().from(announcementScopes)
      .where(and(
        eq(announcementScopes.announcementId, announcements.id),
        inArray(announcementScopes.branchId, accessibleNodeIds),
      ))
  ) : sql`false`,
)
```

---

## Finding AS-06: scopedBranchIds on create router — plan is forward-looking but correct

The plan adds `scopedBranchIds: z.array(z.string().uuid()).optional()` to `create` and `update`. These don't exist in the current router. No conflict. The existing `branchId` param on `create` stays (per plan §8 Q3). No issue.

---

## Finding AS-07: update router missing branchId passthrough — LOW

Current `update` router does NOT include `branchId` in its input schema (only create does). This is consistent with the plan (update form doesn't change branchId). No issue.

---

## Summary

| ID | Severity | Auto-fixable in plan |
|---|---|---|
| AS-02 | CRITICAL | Requires definitive decision: add `isAdmin` param to service |
| AS-04 | HIGH | Add `scopedBranchIds?: string[]` to Phase 1 type updates |
| AS-05 | MEDIUM | Add empty-array guard to EXISTS branch |
| AS-03 | MEDIUM | Document as pre-existing gap, out of scope |
| AS-06,07 | LOW | No action |
