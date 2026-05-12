# Test Coverage Audit — Pass 2

## Changes since Pass 1
- TC-01 resolved: empty-array guard in buildScopeFilter means existing tests won't crash
- TC-02 resolved: mixed-scenario test added to integration test plan
- TC-07 resolved: file renamed to `announcements-scope.integration.test.ts`
- TC-04 noted: createAdminContext() mock inconsistency requires attention during implementation

---

## Re-check of TC findings

### TC-01: Existing tests break — RESOLVED ✓
The `buildScopeFilter` guard returns `notExistsClause` when `accessibleNodeIds = []`. Existing tests calling `listActiveAnnouncements({ accessibleNodeIds: [] })` will get only org-wide announcements. All existing test announcements have no scope rows (NOT EXISTS always true = org-wide). Tests continue to pass.

### TC-02: Mixed-scenario test — RESOLVED ✓
Plan now includes test 3: "create one org-wide + one Branch A-scoped; verify Branch A member sees both; Branch B member sees only org-wide."

### TC-04: Admin mock inconsistency — PARTIALLY ADDRESSED
The plan now includes `isAdmin: context.member?.role === "admin"` in the router. Unit tests using `createAdminContext()` should pass `isAdmin: true` directly to the service. The plan does NOT update `createAdminContext()` in the test factory — implementors must remember to pass `isAdmin: true` in admin unit test scenarios. This is a documentation gap.

### TC-07: File naming — RESOLVED ✓

---

## New finding P2-TC-01: Unit test plan doesn't specify isAdmin scenarios — MEDIUM

Plan §7 unit tests:
1. `listActiveAnnouncements` — announcement with no scopes visible to any member.
2. `listActiveAnnouncements` — announcement scoped to Branch A is visible to Branch A member; invisible to Branch B member.
3. `listActiveAnnouncements` — announcement scoped to Branch A is visible to Region admin (whose `accessibleNodeIds` includes Branch A as a descendant).
4. `createAnnouncement` with `scopedBranchIds` — verifies rows inserted in `announcement_scopes`.
5. `updateAnnouncement` with `scopedBranchIds: []` — verifies scopes cleared (org-wide).
6. `updateAnnouncement` without `scopedBranchIds` — verifies existing scopes unchanged.

**Gaps after Pass 1 fixes:**
- Test 3 says "Region admin whose `accessibleNodeIds` includes Branch A" — but this is testing with a non-empty `accessibleNodeIds`, not with `isAdmin: true`. The real admin bypass uses `isAdmin: true`. There should be an explicit test: `listAnnouncements({ isAdmin: true, accessibleNodeIds: [] })` returns ALL announcements including scoped ones.
- No test for `listAnnouncements({ isAdmin: false, accessibleNodeIds: [] })` — returns only org-wide.

**Required additions to unit test plan:**
- Test 7: `listAnnouncements` with `isAdmin: true` returns scoped announcements even when `accessibleNodeIds: []`
- Test 8: `listAnnouncements` with `isAdmin: false, accessibleNodeIds: []` returns only org-wide announcements

---

## New finding P2-TC-02: No test for setAnnouncementScopes transaction behavior — LOW

The plan's Task 1.3 wraps delete+insert in a transaction. No test verifies that a failure during the INSERT (e.g., invalid branchId FK) rolls back the DELETE. In the unit test environment with mock DB, this can't be tested. The integration test could verify FK enforcement, but it's not in the plan.

**Risk:** Low. FK violations during scope insert would throw at the service layer, rolling back via the transaction. The announcement row itself is already committed at that point (see Task 1.4 — create announcement, then call setAnnouncementScopes). Wait — if setAnnouncementScopes fails, the announcement IS already inserted but has no scope rows (org-wide). This is a partial-write scenario.

**Recommendation:** In `createAnnouncement`, wrap BOTH the announcement insert AND `setAnnouncementScopes` in the same outer transaction (not nested). The plan currently says "insert announcement row, THEN call setAnnouncementScopes" — these are sequential, not in the same transaction. If scope insertion fails, the announcement remains with no scopes (org-wide). This may be acceptable (announcement exists, just without intended scopes). Flag for plan to address.

---

## New finding P2-TC-03: Integration test cleanup — LOW

The existing integration test `afterAll` cleans up by deleting from `announcements` with `WHERE id IN (...)`. Cascade delete on `announcement_scopes` (via FK) means scope rows are also cleaned up. The new `announcements-scope.integration.test.ts` should follow the same cleanup pattern. The plan does not specify this. Low risk — implementors can follow the existing pattern.

---

## Summary

| ID | Severity | New? | Action |
|---|---|---|---|
| P2-TC-01 | MEDIUM | Yes | Add isAdmin unit test cases to §7 |
| P2-TC-02 | LOW | Yes | Note partial-write risk on create+setScopes; consider outer transaction |
| P2-TC-03 | LOW | Yes | Note cleanup pattern in plan for new test file |
| TC-04 | MEDIUM | Carry-over | Implementors must pass isAdmin: true in admin unit tests |
