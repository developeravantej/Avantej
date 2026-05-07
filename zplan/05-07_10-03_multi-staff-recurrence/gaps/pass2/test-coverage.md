# Pass 2 — Test Coverage Audit

## Summary

Pass 1 test gaps TC-010, TC-011, TC-012 are now reflected in plan.md Phase 1.6 tests. Critical gap TC-003 (2 staff → 2 commission splits) is listed but not yet written. New finding: the EXCLUSION constraint interaction (SD-P2-001) needs its own test.

---

## New Findings

### TC-P2-001 — No test for EXCLUSION constraint interaction with multi-staff trainerId update
**Severity: HIGH**

Phase 1.1 adds `trainerId` update when slot 0 changes. The `appointments_trainer_no_overlap` EXCLUSION constraint will fire if the new trainer is already booked. No test verifies:
1. Changing slot 0 to a trainer who is free → succeeds, trainerId updated
2. Changing slot 0 to a trainer who is busy → fails with overlap error

This is a high-risk interaction between two separately implemented features (overlap constraints vs. multi-staff). Must be tested in Phase 1.6.

---

### TC-P2-002 — No test for "year" timeUnit exclusion from backend
**Severity: MEDIUM**

If "year" is removed from RepeatRuleSection UI (fix for SD-P2-002), no regression test verifies the UI doesn't allow year selection. If "year" is added to backend, no expansion logic test covers it.

---

### TC-P2-003 — Phase 2.11 test for "materialize prevents duplicate on race" requires unique constraint
**Severity: HIGH** (mirrors SD-004, confirmed still open)

The unique constraint `(recurringParentId, startTime)` on appointments has NOT been added to source yet. The Phase 2.11 test "unique constraint prevents duplicate materialization on race" cannot be written until the constraint exists and is migrated.

This is a hard ordering dependency: Phase 0 task 6 (add constraint) must be done before Phase 2.11 race test is written.

---

### TC-P2-004 — No test for `permissions` table seeding of `package_management`
**Severity: MEDIUM**

If `package_management` is not seeded in the permissions table for existing tenants, the `packageInstanceStaff` router will deny all requests. A test that calls `packageInstanceStaff.list` as an admin and verifies it does NOT return FORBIDDEN (i.e., the permission is properly seeded) is needed.

---

## Pass 1 Critical Gap Status

| Gap | Status |
|-----|--------|
| TC-003: 2 staff → 2 commission splits | Still open — listed in plan Phase 1.6 but not yet written |
| TC-010: buffer multi-staff conflict test | Added to plan Phase 1.6 |
| TC-011: resolveMemberIdFromUserId unit test | Added to plan Phase 0 |
| TC-012: frontend staffId convention test | Added to plan Phase 1.6 |
