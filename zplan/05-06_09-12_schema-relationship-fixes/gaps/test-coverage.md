# Test Coverage Audit — Post-Apply Re-Run
**Session:** zplan/05-06_09-12_schema-relationship-fixes
**Run:** 2nd pass (after --apply amendments)
**Findings:** 9 (C 3 · H 5 · M 1)

---

## Findings

### [CRITICAL] Phase 0 migration runner still has no test file in owner-files
**Plan claims:** AF5 annotation added `tenant-migrate.test.ts` to Phase 0 task 0.4 scope
**Actual:** `apps/server/src/tests/integration/tenant-migrate.test.ts` — does NOT exist on disk. The annotation resolves Q1 but the file must still be created by Agent 0.
**File:** Plan §5 Phase 0 Task 0.4 — test file referenced by annotation but not yet created
**Fix:** Agent 0 must create `apps/server/src/tests/integration/tenant-migrate.test.ts` with ≥3 cases: backfill existing tenant, apply pending on fresh tenant, rollback + re-apply

---

### [CRITICAL] Plan names Phase 2 test files that do not exist
**Plan claims:** Agent 2.1 → `members.test.ts`; Agent 2.3 → `sales-tax.test.ts`; Agent 2.4 → `appointment-overlap.test.ts`
**Actual:**
- `apps/server/src/tests/integration/members.test.ts` — does NOT exist (only `members-deactivate.integration.test.ts`)
- `apps/server/src/tests/integration/sales-tax.test.ts` — does NOT exist (only `tax-rates.integration.test.ts`, different scope)
- `apps/server/src/tests/integration/appointment-overlap.test.ts` — does NOT exist (only `appointment-commission.test.ts`)
**File:** Plan §5 Agents 2.1, 2.3, 2.4 owner-files sections
**Fix:** Agents must create these files from scratch; existing files cover different scenarios

---

### [CRITICAL] Phase 3 test coverage model still undefined
**Plan claims:** Phase 3 agents 3.1–3.6 each have acceptance criteria
**Actual:** No test file per Phase 3 agent in owner-files. Cron `auto-resume-holds.ts` logic has zero test plan. `--apply` run annotated Phase 2 but did NOT add test annotations to Phase 3 sections.
**File:** Plan §5 Phase 3 section — no test files in any agent's owner-files
**Fix:** Each Phase 3 agent owner-files must include a test file. Minimum: `membership-holds.test.ts` (3.1), `walk-in-conversion.test.ts` (3.5), `households.test.ts` (3.6)

---

### [HIGH] Agent 2.7 (status history) test annotation NOT applied to agent section
**Plan claims:** First audit flagged H7 — no test file for Agent 2.7
**Actual:** The HIGH annotation for test coverage was NOT added to Agent 2.7's owner-files section during the `--apply` run. No test file exists or is listed for 4 new `*_status_history` tables.
**File:** Plan §5 Agent 2.7 owner-files — no test file listed
**Fix:** Add `apps/server/src/tests/integration/status-history.test.ts` to Agent 2.7 owner-files; minimum one test per entity transition (packages, sales orders, commissions, appointments)

---

### [HIGH] Agent 2.2 (branch pricing) test annotation NOT applied to agent section
**Plan claims:** First audit flagged H8 — no test file for Agent 2.2 pricing fallback chain
**Actual:** The HIGH annotation for test coverage was NOT added to Agent 2.2's owner-files section during the `--apply` run. Critical fallback: `(service_id, branch_id, customer_type)` → `(service_id, branch_id, NULL)` → `services.price` has no automated coverage.
**File:** Plan §5 Agent 2.2 owner-files — no test file listed
**Fix:** Add `apps/server/src/tests/integration/pricing.test.ts` to Agent 2.2 owner-files covering all 3 fallback tiers and null-customer-type edge case

---

### [HIGH] Agent 2.6 (stock movements) has no test file
**Plan claims:** J6 "Operator views stock movement audit" with ledger reconciliation accepted
**Actual:** Plan does NOT list `stock-movements.test.ts` in Agent 2.6 owner-files. Financial audit trail; no automated coverage for append-on-PO-receipt, cursor pagination, ledger balance reconciliation.
**File:** Plan §5 Agent 2.6 owner-files
**Fix:** Add `apps/server/src/tests/integration/stock-movements.test.ts` to Agent 2.6 owner-files

---

### [HIGH] Agent 2.5 (commission versioning) has no test file
**Plan claims:** "dispute scenario reproduces splits from frozen config version; payouts grouped by batch"
**Actual:** Plan does NOT list a test file for Agent 2.5. `commission-calculator.test.ts` and `appointment-commission.test.ts` don't test config version snapshots or batch grouping.
**File:** Plan §5 Agent 2.5 owner-files
**Fix:** Add `commission-versioning.test.ts` to Agent 2.5 owner-files covering: split creation snapshots `configVersionId`, dispute recovery from frozen version

---

### [HIGH] Agent 2.8 (refund items) has no test file
**Plan claims:** J5 credit decrement + audit trail acceptance criteria
**Actual:** No `refund-items.test.ts` in Agent 2.8 owner-files. New critical discovery (see type-safety.md): `creditsRemaining` is a computed column — refund concurrency pattern must be redesigned. Test coverage is essential to validate the correct concurrency approach.
**File:** Plan §5 Agent 2.8 owner-files
**Fix:** Add `apps/server/src/tests/integration/refund-items.test.ts` covering: partial refund creation, concurrent refund race prevention, credit ledger correctness

---

### [MEDIUM] Commission service naming drift blocks test authoring
**Plan claims:** Agents 2.5 and 2.9 modify `commission.service.ts`
**Actual:** Codebase has 3 files: `commission-splits.service.ts`, `commission-calculator.service.ts`, `category-commission.service.ts`. Agent briefs for 2.5 and 2.9 still say `commission.service.ts` in owner-files — test authors cannot write tests against the right file without disambiguation.
**File:** Plan §5 Agent 2.5 owner-files; plan §8.5 drift table
**Fix:** Agent 2.5 brief must specify which of the 3 files it extends. Agent 2.9 test file must import from correct service path.

---

## Integration Test Infrastructure Status

### Exists ✓
- `apps/server/src/tests/helpers/context.factory.ts`
- `apps/server/src/tests/helpers/db-mock.factory.ts`
- `apps/server/src/tests/helpers/fixtures.ts` (14 factories)
- `apps/server/src/tests/helpers/integration-setup.ts` (provides `createTenantDb`, `makeIntegrationAdminContext`)

### Missing test files (plan names or implies):
- `tenant-migrate.test.ts` — Phase 0 foundational
- `members.test.ts` — J1 custom role + permission resolution
- `sales-tax.test.ts` — J2 tax snapshot + historical reproducibility
- `appointment-overlap.test.ts` — J3 EXCLUDE constraint
- `pricing.test.ts` — J2 pricing fallback chain (H8 — annotation NOT applied)
- `stock-movements.test.ts` — J6 ledger audit trail
- `refund-items.test.ts` — J5 credit decrement + audit trail
- `commission-versioning.test.ts` — Agent 2.5 dispute recovery
- `status-history.test.ts` — Agent 2.7 all 4 entity transitions (H7 — annotation NOT applied)
- `membership-holds.test.ts` — J4 freeze + auto-resume (Phase 3)

---

## Summary

`--apply` resolved Q1 (tenant-migrate test documented) and Q5 (overlap script) but did NOT add test file entries to Agent 2.2, 2.7, or Phase 3 agent sections. Nine test files remain entirely absent. Integration infrastructure (helpers, fixtures) is adequate — the gap is solely in plan completeness. Three CRITICAL findings: Phase 0 runner test, three misnamed Phase 2 test files, and Phase 3 test model undefined. Every Phase 2 agent's owner-files section must include an explicit test file path before agent dispatch — currently 7 of 10 agents are missing one.
