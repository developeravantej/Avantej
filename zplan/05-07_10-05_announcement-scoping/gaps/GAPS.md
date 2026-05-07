# GAPS.md — Pass 1 Synthesis
## Plan: Announcement Branch Scoping

---

## CRITICAL findings (2)

### CRITICAL-1: Drizzle inArray with empty accessibleNodeIds — runtime crash
**Source:** api-surface.md AS-05, type-safety.md TS-01

The plan's EXISTS branch uses `inArray(announcementScopes.branchId, accessibleNodeIds)` but Drizzle throws when the array is empty. `listActive` sends `accessibleNodeIds: context.accessibleNodeIds ?? []` — empty array possible on auth errors. All existing integration tests call with `[]`. **Phase 1 will be completely broken without this fix.**

**Fix:** Add empty-array guard before constructing EXISTS subquery. When `accessibleNodeIds.length === 0`, use only `notExists(...)` (org-wide only) or skip filter if admin.

### CRITICAL-2: Admin bypass not defined — data visibility risk
**Source:** api-surface.md AS-02, type-safety.md TS-02

The plan states in §8 Q2 that "the EXISTS filter naturally passes" for admins, claiming all node IDs are in `accessibleNodeIds`. In production this is true (admin has a root hierarchyScopeId). But:
1. The `createContext` error path sets `accessibleNodeIds = []` on failure → admin sees only org-wide announcements (silent data loss).
2. The test factory mock sets `accessibleNodeIds: []` for all admin contexts → unit tests testing "admin sees all scoped announcements" will produce wrong results.

**Fix:** Add `isAdmin?: boolean` param to `listAnnouncements` and `listActiveAnnouncements`. Skip scope filter when `isAdmin: true`. Router passes `isAdmin: context.member?.role === "admin"`.

---

## HIGH findings (3)

### HIGH-1: Existing integration tests break after Phase 1
**Source:** test-coverage.md TC-01

All existing `listActiveAnnouncements` integration tests call with `accessibleNodeIds: []`. After Phase 1 lands, these will crash (see CRITICAL-1). These are passing tests today that Phase 1 will break if the guard isn't in place.

**Fix:** Implement CRITICAL-1 guard first; then existing tests pass unchanged.

### HIGH-2: Phase 1→Phase 2 type gap in view.tsx
**Source:** api-surface.md AS-04, type-safety.md TS-04

After Phase 1, the API returns `scopedBranchIds: string[]` but `AnnouncementRow` type doesn't include it. `bun check-types` will pass (unused fields don't cause errors at the call site), but Phase 2's `openEdit` accessing `row.scopedBranchIds` will fail type-check until Task 2.2 updates the type.

**Fix:** Add `scopedBranchIds?: string[]` to `AnnouncementRow` in Phase 1 (Task 1.8 companion frontend change) to avoid mid-development type errors. Or gate strictly to Phase 2 and accept the gap.

### HIGH-3: Mixed org-wide + scoped scenario untested
**Source:** test-coverage.md TC-02

The primary security property (wrong-branch member sees nothing) is planned to be tested. But the mixed scenario "member sees org-wide announcements AND their-branch announcements but NOT other-branch announcements" is not explicitly in the test plan. This is the most realistic production scenario.

**Fix:** Add explicit mixed-scenario test to `announcements-scope.integration.test.ts`.

---

## MEDIUM findings (5)

### MEDIUM-1: scopeMap syntax error in plan
**Source:** doc-consistency.md DC-06, type-safety.md TS-07

`const scopeMap = Map<string, string[]>` is invalid TypeScript — missing `new`. Would cause compile error if copy-pasted.

**Fix:** Change to `const scopeMap = new Map<string, string[]>();` in plan.

### MEDIUM-2: Test file naming convention mismatch
**Source:** doc-consistency.md DC-04, test-coverage.md TC-07

New integration test file named `announcements-scope.test.ts` should be `announcements-scope.integration.test.ts` to match `announcements.integration.test.ts`.

**Fix:** Update plan's file name reference.

### MEDIUM-3: listActive missing memberType passthrough
**Source:** api-surface.md AS-03

`listActive` router doesn't pass `memberType`. Clients see staff-only announcements and staff see client-only. Pre-existing gap, not introduced by this plan.

**Fix:** Out of scope for this plan; document as known pre-existing gap.

### MEDIUM-4: cascade delete on branchId can silently widen scope
**Source:** schema-drift.md SD-03, SD-05

Deleting a hierarchy node cascade-deletes its `announcement_scopes` rows, silently making announcements org-wide. Deleting a node with `announcements.branchId = X` hard-deletes those announcements.

**Fix:** Document in plan §6 breakage analysis.

### MEDIUM-5: staleTime missing from hierarchy.listNodes query
**Source:** scalability.md SC-05

Plan recommends `staleTime: 5 min` but doesn't show it in the code snippet.

**Fix:** Add `staleTime: 5 * 60 * 1000` to Task 2.1 code snippet.

---

## LOW findings (6+)

- SD-09: Pre-existing missing `withTimezone` on announcement timestamps (out of scope)
- SD-08: No timestamps on announcement_scopes rows (audit trail concern, out of scope)
- SC-04: Two correlated subqueries per row (acceptable at scale; document)
- TC-06: No frontend test for Scope column renderer (optional)
- DC-05: Verify import path during implementation
- AS-07: update router missing branchId (intentional, consistent with plan)

---

## Pass 1 Fix Counts

| Category | Count |
|---|---|
| CRITICAL | 2 |
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 6+ |
| **Total issues** | **16** |

Auto-fixable in plan (no implementation code change needed, only plan text):
- MEDIUM-1: Fix scopeMap syntax (plan text)
- MEDIUM-2: Fix test file name (plan text)
- MEDIUM-4: Add cascade delete risk to §6 (plan text)
- MEDIUM-5: Add staleTime to Task 2.1 (plan text)

Requires plan architecture decision:
- CRITICAL-1: Add empty-array guard (plan + implementation)
- CRITICAL-2: Add isAdmin bypass (plan + implementation)
- HIGH-1: Resolved by CRITICAL-1
- HIGH-2: Add `scopedBranchIds?: string[]` to Phase 1 tasks
- HIGH-3: Add mixed-scenario test to plan
