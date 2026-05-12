# Swarm Audit — GAPS.md
**Session:** zplan/04-23_12-38_installment-enhancements
**Run at:** 2026-04-23T12:50Z
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 36 (4 critical · 9 high · 11 medium · 4 low · 9 info)

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 1 | type-safety | Phase 3→4 gate missing: `appointment.service.ts` references `allowCreditOverdraft` before Drizzle codegen runs | `packages/services/src/appointment.service.ts:264` | Add explicit gate in Phase 4 preamble: Task 3.5 (`bun check-types` clean) must pass before Task 4.3 begins |
| 2 | test-coverage | AC1–AC3 (due_soon filter): feature not implemented, zero tests | `packages/api/src/routers/installments.ts:214` | Implement filter branch + extend enum (Phase 1 Tasks 1.1/1.3), then add 4 unit test cases |
| 3 | test-coverage | AC4–AC7 (setPackageOverdraft): function missing, schema column absent, zero tests | `packages/services/src/installment.service.ts` | Phase 3 adds column; Phase 4 adds function + unit tests |
| 4 | test-coverage | AC8–AC10 (appointment booking with overdraft): condition unmodified, test file absent | `packages/services/src/appointment.service.ts:264` | Phase 4 Task 4.3 + create `appointment.service.test.ts` |

---

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 5 | schema-drift | `TENANT_MIGRATIONS` array ends at 0015 — constants 0016–0029 defined but not in runtime array; migration runner skips them | `packages/db/src/migrate-tenant.ts:2355` | Append all 0016–0029 constants to the array before adding the new 0016 migration |
| 6 | schema-drift | Project memory claims latest embedded migration is `0007_short_korath` — stale by 8 versions | `packages/db/src/migrate-tenant.ts:2355` | Update memory; verify actual sequence number before running `db:generate:tenant` |
| 7 | test-coverage | AC11 integration test: `installments.integration.test.ts` must be created, not amended | `apps/server/src/tests/integration/` | Change Task 4.6 from "add to existing" to "create file" |
| 8 | test-coverage | AC12 frontend test: `apps/web/src/__tests__/pages/packages/` directory does not exist | `apps/web/src/__tests__/pages/` | Tasks 1.6 / 5.5 must create directory first |
| 9 | test-coverage | Router `adminOverview` status enum missing `"due_soon"` | `packages/api/src/routers/installments.ts:214` | Phase 1 Task 1.1: extend enum |
| 10 | test-coverage | Mock DB factory missing `query.packageInstances`, `query.installments`, `query.installmentEvents` — Phase 4 unit tests will throw `undefined` | `apps/server/src/tests/helpers/db-mock.factory.ts:88–106` | Add three missing query table mocks before writing Phase 4 unit tests |
| 11 | type-safety | `AdminInstallmentOverviewItem` declares `nextInstallmentAmount` / `nextInstallmentId` optional fields but service never populates them — runtime returns `undefined` | `packages/services/src/installment.service.ts:858,936` | Task 1.5 must update both the type AND the service return mapping atomically |
| 12 | scalability | `getAdminInstallmentOverview` does a second full-table scan to count totals (`.length` on all rows, no LIMIT) — O(N) on every page open | `packages/services/src/installment.service.ts:943–947` | Replace with `SELECT COUNT(*) WHERE <same conditions>` SQL aggregate |

---

### P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 13 | schema-drift | Two migration files share number `0014` — past naming collision; confirm 0016 slot is clean before generating | `packages/db/src/migrations/tenant/` | Verify no `0016_*.sql` exists before running `db:generate:tenant` |
| 14 | test-coverage | Integration tests require `.dev.vars` with `TENANT_DATABASE_URL` — silent failure if absent | `apps/server/src/tests/helpers/integration-setup.ts:73–96` | Document as prerequisite in Phase 4 Task 4.6 execute notes |
| 15 | test-coverage | Frontend mock client has no `installments` namespace — Phase 5 tests will throw | `apps/web/src/__tests__/helpers/mock-client.ts:111–127` | Add `installments: { setOverdraft: vi.fn().mockResolvedValue({}) }` before Phase 5 Task 5.5 |
| 16 | test-coverage | Existing `installment.test.ts` compatible but needs new describe blocks for new cases | `apps/server/src/tests/unit/services/installment.test.ts` | Append `describe("due_soon filter")` and `describe("setPackageOverdraft")` blocks |
| 17 | doc-consistency | Task 4.6 implies modifying an existing integration test file that does not exist | `apps/server/src/tests/integration/` | Reword Task 4.6 to "create file" |
| 18 | doc-consistency | Task 4.5 wording "if absent, add the file" is ambiguous; file is confirmed absent | `apps/server/src/tests/unit/services/` | Change to "Create `appointment.service.test.ts` with:" |
| 19 | doc-consistency | Web test directory `__tests__/pages/packages/` absent; tasks implicitly assume it exists | `apps/web/src/__tests__/pages/` | Explicit `mkdir` step in Tasks 1.6 and 5.5 |
| 20 | doc-consistency | Appointment service line ranges slightly off: lock check = 264-266 (3 lines), not 264-274 (11 lines) | `packages/services/src/appointment.service.ts:264` | Correct cited ranges in plan §3 and §6 |
| 21 | type-safety | `installmentEvents.metadata` is `text`; all callers use `JSON.stringify` correctly, but readers must `JSON.parse` — no comment warns of this | `packages/db/src/schema/tenant/installment-events.ts:16` | Add one-line comment in `setPackageOverdraft` implementation |
| 22 | scalability | Task 1.5 batch query: `installments` table has no composite index on `(package_instance_id, status, installment_number)`; will scan all installments per package | `packages/db/src/schema/tenant/installments.ts:22` | Add composite index in same or follow-on migration |
| 23 | scalability | `gracePeriodEndsAt IS NULL` predicate in `due_soon` filter has no supporting index; partial index needed if EXPLAIN shows seq scan | `packages/db/src/schema/tenant/package-instances.ts:87–88` | Run `EXPLAIN ANALYZE` post-Phase 1 deploy; add partial index if needed |

---

### P4 — Low / Info

- **[schema-drift INFO]** Column insertion point verified (line 74 of package-instances.ts) ✓
- **[schema-drift INFO]** `package_instances_is_locked_idx` and `package_instances_next_due_date_idx` verified at lines 87–88 ✓
- **[schema-drift INFO]** `installmentEvents.installmentId` is nullable ✓
- **[schema-drift INFO]** `installmentEvents.eventType` is `text` (no migration needed for new values) ✓
- **[api-surface INFO]** `installmentsRouter` in `baseRouter`, all referenced procedures exist with correct auth patterns ✓
- **[api-surface INFO]** `manualUnlock` pattern at line 143 confirmed as the correct mirror for `setOverdraft` ✓
- **[api-surface INFO]** Frontend component (`installments-page.tsx`) and legacy route redirect confirmed present ✓
- **[api-surface INFO]** No conflicts in `apps/server/src/routers/` ✓
- **[api-surface INFO]** `adjustCredits` error-code pattern at lines 631/634 confirmed ✓
- **[test-coverage LOW]** Run `grep -n "isLocked" packages/services/src/*.ts` as pre-Phase-4 gate to confirm no other lock-check paths exist
- **[test-coverage LOW]** `check-ins.service.ts` comment about future `isLocked` check: add during Phase 4 if applicable
- **[doc-consistency LOW]** Open Question #1 is both "blocked" and "has working default (B)" — contradictory; resolve to one answer before Phase 3
- **[scalability LOW]** `setPackageOverdraft` design (single-row lock, two inserts, `writeAudit(tx,...)`) is sound; no scalability concern ✓

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 0 | 2 | 1 | 0 | 4 | ⚠️ 2 high — migration array incomplete |
| api-surface | 0 | 0 | 0 | 0 | 5 | ✅ Clean |
| test-coverage | 3 | 4 | 3 | 2 | 0 | 🔴 All features untested |
| doc-consistency | 0 | 1 | 3 | 1 | 0 | ⚠️ File path / wording issues |
| type-safety | 1 | 1 | 1 | 0 | 0 | 🔴 Phase gate missing; type contract broken |
| scalability | 0 | 1 | 2 | 1 | 0 | ⚠️ Count query pre-existing bug |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P1 — Critical (4 items) | 3 service files, 1 router | ~2 000 | Mostly "add this block" edits; no new files |
| P2 schema — migration array fix | `migrate-tenant.ts` | ~1 500 | Append 14 constants to array; then add 0016 |
| P2 type — AdminInstallmentOverviewItem | `installment.service.ts` | ~800 | Type update + service mapping change |
| P2 scalability — count query fix | `installment.service.ts` | ~400 | Replace 5 lines with SQL count |
| P2 test infra — mock factory + mock client | 2 helper files | ~600 | Additive; low risk |
| P3 — Composite index on installments | `installments.ts` + migration | ~800 | Schema + migration file |
| P3 — doc wording fixes | `plan/plan.md` | ~400 | Surgical edits |
| P4 — Low/info items | various | ~200 | Comments + one grep |

**Estimated total to address P1+P2:** ~6 000 tokens of edits  
**Estimated total for all P1–P3:** ~8 500 tokens of edits

---

## Auto-fixable findings

Findings that are purely mechanical and safe for `--apply`.

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| A1 | doc-consistency | Task 4.6 says "add to" a non-existent file | `plan.md §5 Phase 4 Task 4.6` | Change "add to" → "create" |
| A2 | doc-consistency | Task 4.5 says "if absent, add the file" | `plan.md §5 Phase 4 Task 4.5` | Change to "Create `appointment.service.test.ts` with:" |
| A3 | doc-consistency | Tasks 1.6 / 5.5 don't mention creating the directory | `plan.md §5 Phase 1 Task 1.6, Phase 5 Task 5.5` | Prepend "Create `apps/web/src/__tests__/pages/packages/` if absent." |
| A4 | doc-consistency | Lock check line range cited as 264-274 (wrong) | `plan.md §3 Consumption-Side Changes` | Change "264-274" → "264-266" |
| A5 | doc-consistency | OQ#1 contradicts itself (blocked + working default) | `plan.md §5 Phase 3 preamble + §8 OQ1` | Add `**Resolved: YES (B)**` after OQ1 default statement and remove "Blocked on:" from Phase 3 preamble |
| A6 | type-safety | No Phase 4 gate stating Task 3.5 must pass before Task 4.3 | `plan.md §5 Phase 4 Tasks preamble` | Add "**Gate:** `bun check-types` must pass in `packages/db` and `packages/services` before beginning Task 4.3." |
