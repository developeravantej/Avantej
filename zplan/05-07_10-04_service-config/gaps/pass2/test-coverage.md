# Test Coverage Audit — Pass 2

**Auditor:** test-coverage-auditor
**Date:** 2026-05-07 (Pass 2)

## Pass 1 Fixes Verified

- H1 (no derivedTrainers tests) — FIXED: plan now proposes 4 test cases (E, F, G, H) in `useAppointmentFormState-filter.test.ts`
- H2 (no UUID fallback test) — FIXED: plan now proposes Test A for UUID fallback in integration test

## New Findings (Pass 2)

### P2-TC1 — MEDIUM: Test D (scheduler permission) not completable without `appointment_management:read` fixture

The proposed Test D:
> A member with `appointment_management:read` CAN call `listForService` (scheduler permission path)

Looking at the integration test helpers (`apps/server/src/tests/helpers/context.factory.ts`), they create `createAdminContext()` and `createStaffContext()`. Neither creates a "scheduler" context with `appointment_management:read` specifically.

The existing permission test pattern (from `invitations-scope.test.ts`) creates contexts with specific role permissions. To test the scheduler path, the test would need to:
1. Create a member with a custom role that has `appointment_management:read` but NOT `service_management:read` or `user_management:read`
2. Call `listForService` with that context
3. Assert success

This is possible but requires using the existing `role-permissions` setup pattern from integration tests. **The plan should note this setup requirement.**

### P2-TC2 — LOW: Test E/F/G/H are frontend hook tests — require mocking `useQuery`

The proposed hook tests in `useAppointmentFormState-filter.test.ts` depend on `useQuery` returning `serviceAssignments`. Testing React hooks that use `useQuery` requires either:
- Wrapping in `QueryClientProvider` with a mock server
- Using `vi.mock('@/utils/orpc')` pattern (confirmed to work — see `apps/web/src/__tests__/helpers/mock-client.ts`)

The plan's test proposals are valid but need this mocking context. **LOW — implementable with existing test infrastructure.**

### P2-TC3 — VERIFIED: Manual test coverage is adequate for UI paths

The 6 manual test cases listed in the plan cover all Phase 1, 2, 3 journeys. These are appropriate for UI-level testing that can't be automated without E2E tests.

## Summary

| ID | Severity | Finding |
|---|---|---|
| P2-TC1 | MEDIUM | Test D needs scheduler context setup documentation |
| P2-TC2 | LOW | Hook tests require QueryClientProvider + mock setup |
| P2-TC3 | VERIFIED | Manual test coverage adequate |
