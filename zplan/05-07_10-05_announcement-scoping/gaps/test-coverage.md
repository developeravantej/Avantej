# Test Coverage Audit — Pass 1

## Source files checked
- `apps/server/src/tests/integration/announcements.integration.test.ts` (existing)
- `apps/server/src/tests/helpers/context.factory.ts`
- `apps/server/src/tests/helpers/integration-setup.ts`
- Plan §7 (Testing section)

---

## Existing test coverage (pre-plan)

The existing `announcements.integration.test.ts` covers:
1. Create → list → update → soft-delete lifecycle
2. `listActiveAnnouncements` excludes expired announcements
3. `listActiveAnnouncements` filters by targetAudience
4. Pinned announcements sort order

None of these tests touch `announcement_scopes` at all. They all pass `accessibleNodeIds: []` to `listActiveAnnouncements`, which under the NEW EXISTS/NOT EXISTS logic would cause a Drizzle crash (see AS-05 in api-surface.md). These tests will BREAK after Phase 1 lands.

---

## Finding TC-01: Existing integration tests break after Phase 1 — CRITICAL

All existing `listActiveAnnouncements` integration test calls use `accessibleNodeIds: []`. After Phase 1 replaces the branchId filter with EXISTS/NOT EXISTS + `inArray(announcementScopes.branchId, accessibleNodeIds)`, calling with `[]` will throw a SQL error unless the empty-array guard (AS-05) is implemented.

**Required fix:** Either implement the guard in Phase 1 (resolves both AS-05 and TC-01), or update existing tests to pass a non-empty `accessibleNodeIds`. The guard approach is cleaner.

---

## Finding TC-02: Scope-filter acceptance criterion untested — HIGH (data leak risk)

**Plan §7 tests:**
- Test 2: "announcement scoped to Branch A is visible to Branch A member; invisible to Branch B member"

This is the **primary security property** of this feature. Wrong scope = data leak. The plan proposes this test in `announcements.service.test.ts` (unit) AND in `announcements-scope.test.ts` (integration).

**Current state:** Neither test file exists. The plan proposes creating them. Good.

**Gap:** The unit test can't truly test the EXISTS subquery because it uses mock DB. The integration test is the real guard. The plan says "Full round-trip: create with scopes → listActive as scoped member → verify result." This is correct but:
- No test verifies that a non-member (wrong branch) gets ZERO results when all announcements are scoped (complete exclusion scenario)
- No test verifies the "both org-wide AND scoped" mixed scenario

**Required addition:** Add test case: "member with Branch B access sees org-wide but not Branch A-only announcements" (mixed scenario).

---

## Finding TC-03: setAnnouncementScopes idempotency untested — MEDIUM

Plan Test 6: "`updateAnnouncement` without `scopedBranchIds` — verifies existing scopes unchanged."

This is important: the partial-update semantics (`undefined` = don't touch scopes; `[]` = clear scopes; `[ids]` = replace scopes) need to be explicitly tested. The plan proposes this test. Sufficient if implemented. Flagging to ensure it's a unit test with mock DB or integration test.

---

## Finding TC-04: Mock context admin accessibleNodeIds — HIGH

`createAdminContext()` returns `accessibleNodeIds: []`. Plan unit tests for admin scenarios that call `listAnnouncements` with this context will be testing a broken admin (empty accessible nodes), not a real admin (all nodes). After Phase 1, tests like "admin sees all announcements including scoped ones" will fail when using `createAdminContext()`.

**Required fix:** Update `createAdminContext()` to use a realistic `accessibleNodeIds` for admin tests, OR add `isAdmin: true` bypass to the service (then admin unit tests can pass `isAdmin: true`).

---

## Finding TC-05: No test for branchId cascade delete (existing scopes cleared) — LOW

If a hierarchy node is deleted (cascade), its `announcement_scopes` rows are deleted. An announcement that was scoped to only that branch becomes org-wide. This is a surprising behavior that could be considered a bug. No test covers it. Low priority since node deletion is infrequent.

---

## Finding TC-06: Frontend tests explicitly excluded — note

Plan §7: "Frontend tests: Not required for this plan." Acceptable — the scope selector is a straightforward checklist and the filtering is 100% server-side. However, the Scope column renderer in Task 2.5 has non-trivial logic (truncate with `(+N)` count). A quick snapshot test or unit test for the renderer would reduce regression risk. Flagging as LOW.

---

## Finding TC-07: Integration test file name mismatch — MEDIUM

**Plan §7:** New file `apps/server/src/tests/integration/announcements-scope.test.ts`

**Existing file:** `apps/server/src/tests/integration/announcements.integration.test.ts`

The existing file uses `.integration.test.ts` suffix; the plan's new file uses `-scope.test.ts`. This is inconsistent with the project naming convention. The new file should be `announcements-scope.integration.test.ts` to match the existing pattern.

---

## Acceptance criteria mapping

| Plan AC | Test exists? | Risk if untested |
|---|---|---|
| Scope-filtered listActive hides wrong-branch announcements | Proposed (not yet written) | Data leak — HIGH |
| Org-wide (no scopes) visible to all | Proposed unit test | HIGH |
| setAnnouncementScopes inserts rows on create | Proposed unit test | MEDIUM |
| Existing tests pass after Phase 1 | NOT covered — will break | CRITICAL |
| Admin sees all announcements | Proposed but uses broken mock | HIGH |
| Mixed org-wide + scoped scenario | Missing | HIGH |

---

## Summary

| ID | Severity | Action |
|---|---|---|
| TC-01 | CRITICAL | Implement empty-array guard (AS-05) before tests can pass |
| TC-02 | HIGH | Add mixed-scenario test to integration test plan |
| TC-04 | HIGH | Fix `createAdminContext()` or add isAdmin bypass |
| TC-07 | MEDIUM | Rename file to `announcements-scope.integration.test.ts` |
| TC-03 | MEDIUM | Already planned; ensure implemented |
| TC-05,06 | LOW | Document, no immediate action |
