# Test Coverage Audit — Pass 1

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** test-coverage-auditor

---

## Summary

The plan specifies required tests for Phase 1 backend. Phases 2 & 3 are explicitly scoped as "manual verification sufficient for first pass." No existing test files cover `category-buffer-overrides` service (as expected — the service does not exist yet).

---

## Findings

### HIGH — T1: No existing test infrastructure for `categoryBufferOverrides` integration tests

**Rating:** HIGH

The plan proposes:
- `apps/server/src/tests/unit/category-buffer-overrides.service.test.ts`
- `apps/server/src/tests/integration/category-buffer-overrides.test.ts`

Neither file exists (confirmed by Glob). These are NEW test files to be created as part of the plan.

**The plan documents what tests are needed but does NOT include the test file content.** Every other Phase 3 API feature in this codebase has matching unit + integration tests (e.g., `purchase-orders.integration.test.ts`, `promotions.integration.test.ts`, `tax-rates.integration.test.ts`).

**Gap:** The plan mentions test file names and test cases (Section 7 Testing) but provides no test code scaffolding. Implementors must write tests from scratch.

**Risk:** Without test stubs, implementors may skip or defer tests. For a mutation that modifies trainer configuration data, test coverage is required per project conventions.

---

### CRITICAL — T2: `upsert` mutation (admin write path) has zero test coverage specified for permission boundary

**Rating:** CRITICAL

The plan's acceptance criteria for Phase 1 include:
- "Non-admin member cannot call `listForMember` → 403 returned"

But the integration test list does NOT explicitly include:
- Staff cannot call `upsert` (admin-only mutation)
- Admin CAN call `upsert` for a different member's category overrides

The `upsert` procedure checks `user_management` OR `service_management` → `update`. This OR-permission pattern has no test validating that a member with neither permission gets a 403. The plan only specifies "Non-admin cannot `listForMember`" — not "non-admin cannot `upsert`."

**Fix:** Add to integration test list:
- `upsert`: member without `user_management:update` AND without `service_management:update` → FORBIDDEN
- `upsert`: member WITH `service_management:update` → success (OR permission works)

---

### HIGH — T3: `updateMine` category-assignment guard has no test for edge cases

**Rating:** HIGH

The plan specifies: "Staff cannot `updateMine` for category not in their service assignments → NOT_FOUND"

But does not specify:
- What happens when `bufferTimeMinutes` is null (delete case) for a category the staff member DOES have → should succeed
- What happens when `bufferTimeMinutes` is 0 (minimum valid) → boundary test

---

### MEDIUM — T4: `preferredTimes.upsert` atomicity not tested

**Rating:** MEDIUM

Open Question #2 in the plan documents that `upsertPreferredTimes` does a non-atomic delete + insert. The plan acknowledges this risk but explicitly defers the fix. No test is proposed to verify the data-loss scenario or confirm the risk is contained.

**This is acceptable given the plan's scope ("track separately")** but should be noted.

---

### MEDIUM — T5: Phase 2 UI testing deferred entirely

**Rating:** MEDIUM

Phase 2 (PreferredTimesEditor) is marked "manual verification sufficient." The component handles:
- Mutation with optimistic state
- Priority re-assignment on remove
- Max-4-items enforcement

These are non-trivial UI behaviors with no proposed tests. Manual verification is explicitly accepted in the plan.

---

### INFO — T6: Integration test helpers exist and are suitable

**Rating:** INFO

Files confirmed:
- `apps/server/src/tests/helpers/integration-setup.ts` ✓
- `apps/server/src/tests/helpers/context.factory.ts` ✓
- `apps/server/src/tests/helpers/fixtures.ts` ✓

These are sufficient to scaffold integration tests for `categoryBufferOverrides` following the pattern of `purchase-orders.integration.test.ts`.

---

### INFO — T7: Unit test mock DB factory confirmed suitable

**Rating:** INFO

`apps/server/src/tests/helpers/db-mock.factory.ts` — `createMockTenantDb()` — provides mock DB for unit tests. Suitable for testing `listCategoryBufferOverridesForMember` and `upsertCategoryBufferOverride` without a real DB. ✓

---

## Acceptance Criteria Coverage Map

| Plan Acceptance Criteria | Test Specified | Severity if Missing |
|---|---|---|
| Trainer with no assignments → [] | Unit test | HIGH |
| Member with 2 categories, 1 override → correct merge | Unit test | HIGH |
| Upsert: insert new row | Unit test | HIGH |
| Upsert: update existing row | Unit test | HIGH |
| Upsert: null → delete row | Unit test | HIGH |
| Admin can listForMember + upsert | Integration | HIGH |
| Staff can listMine + updateMine for owned category | Integration | HIGH |
| Staff cannot updateMine for non-owned category | Integration | HIGH |
| Non-admin cannot listForMember | Integration | HIGH |
| **Non-admin cannot upsert** | **MISSING** | **CRITICAL** |
| **upsert with service_management perm only → success** | **MISSING** | **HIGH** |
| **updateMine null (delete) for owned category** | **MISSING** | **MEDIUM** |
