# Test Coverage Audit — Pass 2

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** test-coverage-auditor
**Against:** updated plan/plan.md

## Summary

Pass 1 added 3 missing integration test cases. Pass 2 verifies they are well-formed and checks for any remaining gaps.

---

## Findings

### CONFIRMED RESOLVED — T2 (Pass 1 Critical): upsert permission tests now present

The updated plan now includes:
```
- Non-admin (no user_management or service_management) cannot `upsert` → FORBIDDEN
- Member with only `service_management:update` (no `user_management`) CAN `upsert` → success (OR-permission works)
- `updateMine` with `bufferTimeMinutes: null` for owned category → override deleted, returns null
```
✓ All three test cases added.

---

### NEW MEDIUM — T2-1: `listMine` has no test

**Rating:** MEDIUM

The integration test list specifies:
- "Staff can `listMine` and `updateMine` for owned category"

This covers `listMine` at a surface level. But `listMine` delegates to `listCategoryBufferOverridesForMember` with `context.member.id` — meaning it uses the same service function as `listForMember`. The main differentiation is that it is NOT permission-gated (any authenticated member can call it). There is no explicit test for:
- Staff member with no service assignments calls `listMine` → returns `[]`
- Staff member with assignments calls `listMine` → correct data returned

The first case is partially covered by the unit test `"member with no assignments → []"`, but the integration path (through the router, ensuring the self-scoping works) is not explicitly covered.

**Low risk** — the unit tests cover the service function. The router handler is trivial. Still, an explicit integration test for `listMine` returning correct data would give confidence.

---

### NEW LOW — T2-2: Unit test for `upsertCategoryBufferOverride` boundary values

**Rating:** LOW

The unit tests listed are:
- insert new → row created
- update existing → row updated
- null → row deleted

Missing boundary value tests:
- `bufferTimeMinutes: 0` (minimum) → accepted
- `bufferTimeMinutes: 480` (maximum) → accepted

These are Zod-validated at the router layer, so the service function would accept any integer. The Zod constraint is in the router, not the service. No additional service unit test needed — this is a router-level concern and Zod handles it. ✓

---

### NEW MEDIUM — T2-3: No test for concurrent upsert race condition

**Rating:** LOW

Section 7 states: "Concurrent upsert of same (memberId, categoryId) — `INSERT ... ON CONFLICT DO UPDATE` — atomic; safe"

No test validates this behavior. For PostgreSQL ON CONFLICT, this is guaranteed by the database — no application-level test is meaningful here. Correctly not tested.

**No action needed.** ✓

---

### INFO — T2-4: Integration test format is bullet list — no test scaffold provided

**Rating:** MEDIUM

The plan specifies integration test CASES as bullet points but does not provide test file scaffolding. For Phase 3 patterns in this codebase (e.g., `purchase-orders.integration.test.ts`, `promotions.integration.test.ts`), all test files use:
- `beforeAll`: `loadDevVars()`, `createTenantDb()`
- `afterAll`: cleanup
- `makeIntegrationAdminContext()` / `makeIntegrationStaffContext()`

The plan should include a minimal scaffold for the integration test file to reduce implementor friction. Currently not provided — implementors must copy from an existing integration test. This is acceptable but adds friction.

---

### INFO — T2-5: Pass 1 comment syntax in plan.md uses HTML comments

The added test cases use `<!-- audit-swarm: ... -->` HTML comment syntax within a Markdown bullet list. This is visually jarring. It will not prevent implementation.

---

## Status Table

| Finding | Rating | New/Carried |
|---|---|---|
| T2 critical: upsert permission tests | RESOLVED | Fixed in Pass 1 |
| T2-1: listMine integration data test missing | MEDIUM | NEW |
| T2-2: Boundary value unit tests | LOW | NEW (acceptable — Zod handles) |
| T2-3: Concurrency test | INFO | Not needed |
| T2-4: No integration test scaffold | MEDIUM | NEW — adds implementor friction |
| T2-5: Comment syntax | INFO | Cosmetic |
