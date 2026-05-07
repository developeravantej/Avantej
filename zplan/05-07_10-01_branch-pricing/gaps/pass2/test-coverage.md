# Test Coverage Audit — Pass 2
**Lens:** test-coverage-auditor
**Date:** 2026-05-07

## Summary

Pass 1 expanded the test table significantly. Verifying the updated test plan is complete and actionable.

---

## Findings

### [INFO] Test table now comprehensive ✓
Updated plan §7 testing table now includes:
- `expireServicePrice` ✓
- `expireProductPrice` ✓
- `deleteServicePrice` ✓
- `deleteBranchPrice` auth rejection ✓
- `expireBranchPrice` tenant isolation ✓
- `listServicePriceOverrides` expired-row exclusion ✓
- POS items-step component test ✓
- POS fallback component test ✓

### [HIGH] Test location for `expireServicePrice` is specified as `apps/server/src/tests/integration/pricing.test.ts` — but these are integration tests that require `TENANT_DATABASE_URL`. Service-layer unit tests for `expireServicePrice` should also exist at the unit level (without DB). The plan previously referenced `packages/services/src/__tests__/pricing.service.test.ts` — that file does not exist and should be created for pure unit tests (mock db).
- **The current plan sends all tests to integration level.** For `expireServicePrice` (a simple UPDATE), a unit test with a mock DB is faster and more isolated. **Recommendation: split — unit mock tests for service functions, integration for router auth.**

### [HIGH] `expireBranchPrice` tenant isolation test — plan says "rejects priceId from another tenant" but the service function `expireServicePrice(db, priceId)` takes a `priceId` and calls `UPDATE service_prices SET effective_until = ? WHERE id = ?`. This only touches one tenant's DB (each tenant has its own Neon branch), so cross-tenant injection is impossible at the DB level. The real isolation to test is: **does the router verify the priceId belongs to a service the caller has access to?** The error handling section (§7) says "verify the row belongs to the caller's tenant" but the service function itself won't do this — the router handler must do it. The test should be at the router/integration level and verify that a priceId for a service outside the caller's `accessibleNodeIds` is rejected.

### [MEDIUM] POS component test location `apps/web/src/__tests__/pos/items-step.test.tsx` — the `apps/web/src/__tests__/` directory structure exists (from MEMORY.md Phase 3 testing infrastructure). The `pos/` subdirectory does not exist yet but can be created. The test infrastructure (vitest, RTL, mock client at `@/utils/orpc`) is confirmed from MEMORY.md. **Actionable — no blocker.**

### [MEDIUM] `deleteServicePrice` test: the plan says "hard deletes the row" but does not specify testing the **router** `deleteBranchPrice` at the oRPC level. Both the service function AND the router procedure need tests:
1. Service: `deleteServicePrice(db, priceId)` → row gone from DB
2. Router: `deleteBranchPrice` with insufficient permissions → `FORBIDDEN`; with valid permissions → success

### [LOW] `resolveProductPrice` — still no test coverage added in this plan. Acknowledged as acceptable.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| Tests all at integration level — unit-level service tests not specified | HIGH | Yes — add split note |
| Tenant isolation test description is misleading — actual test is router-level access check | HIGH | Yes — clarify in plan |
| `deleteServicePrice` needs both service-level and router-level tests | MEDIUM | Yes — add to plan |
| POS component test dir doesn't exist — needs creation | MEDIUM | Yes — note in plan |
