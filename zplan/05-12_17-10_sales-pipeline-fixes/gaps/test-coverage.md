# Test Coverage Audit — Sales Pipeline Fixes

**Plan:** `zplan/05-12_17-10_sales-pipeline-fixes/plan/plan.md`
**Date:** 2026-05-12
**Scope:** Map plan acceptance criteria to existing/promised tests; flag financial / state-change / refactor blind spots.

Severity legend: `CRITICAL` (zero coverage on financial/security mutation) · `HIGH` (zero coverage on state-changing path) · `MEDIUM` (partial) · `LOW` · `INFO`.

---

## 1. Phase-by-phase acceptance → test mapping

### Phase 1 — Commission rule alignment

| Acceptance | Promised test | Existing nearest | Status |
|---|---|---|---|
| Cancelled appointment → `pending` split with `earnReason='cancellation'` | `appointment.service.test.ts` (extend) + `commission-rule.integration.test.ts` (new) | `apps/server/src/tests/integration/appointment-commission.test.ts` covers completion path only — no cancellation→commission case | **MEDIUM** — extension feasible, but no current cancel→commission assertion to lock baseline |
| POS sale of bookable service produces ZERO splits at sale | `pos.service.test.ts` (extend) | `apps/server/src/tests/integration/pos-commission.test.ts` asserts the OPPOSITE today (split is created at sale). New test must invert + delete that assertion. | **HIGH** — risk of test leftover from old rule producing false-green |
| POS sale of non-bookable item still earns at sale (1.5) | not explicitly listed in 1.8 | none | **HIGH** — branch coverage gap for `service.requiresBooking === false` |
| Idempotency on re-cancel | listed in 1.8 | none | covered by promised test |
| Backfill: voids old POS-pending splits whose appointment hasn't completed (1.6) | **no test promised** | none | **CRITICAL** — see §6 |
| `sales-order.service.ts:268` skip-void when post-delivery (1.7) | not promised | none | **HIGH** — financial mutation conditional with zero coverage |

### Phase 2 — Payouts UI

| Acceptance | Promised test | Existing | Status |
|---|---|---|---|
| `payouts.previewBatch` returns count + total | none | none — no `payouts.service.test.ts` or integration test exists (`grep payout` returns only `commission-versioning.test.ts` incidentally) | **CRITICAL** |
| `payouts.runBatch` flips splits to `paid` in one tx with `SELECT … FOR UPDATE` | none | none | **CRITICAL** — financial mutation, race-condition path called out in §6 of plan |
| Reversal rows render with negative amount + badge | none | none | **HIGH** |
| Trainer (non-admin) gets 403 on page | none | none — no permission denial test for `payout_management` | **HIGH** — security mutation (new perm seed) |
| Permission seed — grant `payout_management` to existing admin roles | none | none | **HIGH** — silent-deploy risk if seed mis-runs |
| E2E Journey A | E2E promised in §7 ("E2E for Journey A … via Playwright in `e2e/`") | `e2e/batch3.dashboard.spec.ts:389` already has `Payouts View` describe block (4 tests against the stub page) | **MEDIUM** — file exists, but currently asserts stub behaviour; will need rewrite + naming convention check (see §7) |

### Phase 3 — Native installment picker

| Acceptance | Promised test | Existing | Status |
|---|---|---|---|
| Plan picker queries `installmentPlans.list({ activeOnly: true })` | `bun --filter native check-types` only | none — no native test infra in repo | **MEDIUM** (acceptable: native is Expo, no Vitest setup) |
| `pay.tsx` renders `selectedPlan.label` | manual only | none | **LOW** |
| `installmentPlans.list` reachable from native auth header | none | `apps/server/src/tests/integration/installment-plans.integration.test.ts` exists — check if it tests `activeOnly` filter | **LOW** — verify-only |

### Phase 4 — Trainer assigned-packages view

| Acceptance | Promised test | Existing | Status |
|---|---|---|---|
| `packageInstances.listAssignedToMe` filters by `member.id` AND status IN ('active','frozen') | none promised | `unit/services/package-instance.test.ts` covers `listForClient`/`getById`/`create` only | **HIGH** — RBAC scope query untested |
| `listPending` scope fix (4.4 — broaden to `accessibleNodeIds`) | none | none | **HIGH** — RBAC broadening with no permission-leak test |
| Tab UI renders `assigned` empty state | none | none | **LOW** |
| E2E Journey B | not in §7 list | none | **INFO** — not promised |

### Phase 5 — Package-instance lifecycle

| Acceptance | Promised test | Existing | Status |
|---|---|---|---|
| Cancel → credit NOT restored | listed in 5.6 | none | covered by promised test |
| Freeze → bookings blocked | listed in 5.6 | none — `appointment.service.ts` create-path check would need new assertion | covered (verify integration scope) |
| Unfreeze → resume | listed in 5.6 | none | covered |
| Extend → `expiresAt` updated, audit row | not explicit | none | **MEDIUM** |
| `markCompleteIfFinal` triggered from both installment-confirm AND session-complete | not promised | none | **HIGH** — dual call sites untested |
| Coach-slot weightage trigger (per migration §3 / 7.14) | "verify with test" — vague | none | **HIGH** — financial constraint trigger with zero direct test |
| Status filter tabs return non-empty after mutation | not promised | none | **LOW** (UI smoke) |
| E2E Journey D | promised in §7 | none | **HIGH** — missing |

### Phase 6 — Sales KPI + cancellation surface

| Acceptance | Promised test | Existing | Status |
|---|---|---|---|
| KPI literal `confirmed` matches writer | none | none | **MEDIUM** — easy regression vector |
| Tax-included revenue | none — `salesOrders.kpiSummary` proc may be added | none | **MEDIUM** — financial number, no test |
| Cancelled-sales list reachable, paginated | none | none | **LOW** |
| `salesOrders.cancel` UI wiring (Cancel Sale button visibility gating) | none | none — `sales-order.test.ts` exists in unit suite, may cover `cancel` proc itself | **MEDIUM** |
| Receipt fallback hardening (6.5) | none | none | **LOW** |

### Phase 7 — Hygiene batch

See §5 (POS schedule consolidation parity).

| Item | Risk | Test promised? |
|---|---|---|
| 7.1 POS first-installment alignment | math drift | none |
| 7.2 POS open-coded schedule → `createInstallmentSchedule` | **math drift** | **none** — see §5 CRITICAL flag |
| 7.5 Drop `?? ""` fallback for `callerUserId`; throw | runtime regressions | "deploy to staging first" — no automated test |
| 7.10 promo-usage walk-in bucket | financial-adjacent | none |
| 7.14 coach-slot weightage CHECK trigger | financial | "verify with test" — not concretely placed |

---

## 2. `integration-setup.ts` helper coverage

`apps/server/src/tests/helpers/integration-setup.ts` provides:
- `loadDevVars()`, `shouldSkipIntegration()`
- `createTenantDb()`, `createControlPanelDb()`
- `makeIntegrationAdminContext(tenantDb)` → admin role with empty `accessibleNodeIds`

**Gaps for new tests in this plan:**

| Need | Status |
|---|---|
| Trainer context (Phase 4 — `listAssignedToMe` requires `member.role === 'staff'` AND scoped `accessibleNodeIds`) | **MISSING** — only `makeIntegrationAdminContext` exists. `context.factory.ts` has `createStaffContext` but it's mock-only, not integration. Need `makeIntegrationTrainerContext(tenantDb, { memberId, hierarchyScopeId })`. |
| Multiple-member context (commission split tests need actor admin + trainer member) | partially — tests inline-create members; no helper |
| Tenant DB seed/reset helpers | none — every integration test inline-creates and tears down its own resources |
| `payout_management` permission seeding (Phase 2) | **MISSING** — no permission-seed helper; tests would need to insert into `permission_grants` manually |

**Severity:** **HIGH** — without a trainer integration context, `commission-rule.integration.test.ts` and any payouts-UI integration test will inline-build context boilerplate, increasing drift risk.

---

## 3. New test files promised — fixture readiness

Plan §1.8 promises three new test files. Helper status:

### `pos.service.test.ts` (commission deferral)
- File already exists at `apps/server/src/tests/unit/services/pos.service.test.ts` (covers walk-in guards) — plan requires extending it.
- Mocks: `buildPosDb()` helper exists locally in that file; can be reused.
- **Missing:** no fixture in `helpers/fixtures.ts` for `salesOrderItems` with `commission_deferred=true` flag (the new column from Open Q-2 Option B). Need `makeSalesOrderItem({ commissionDeferred: true })`.
- **Status:** MEDIUM — feasible, add 1 fixture.

### `appointment.service.test.ts` (cancel→commission)
- File exists at `apps/server/src/tests/unit/services/appointment.service.test.ts` (covers lock-check).
- **Missing fixtures:** `makeAppointment()` (none in `fixtures.ts` — every existing test inline-builds appointment objects). Plan needs both completion and cancellation paths to insert splits.
- `makeCommissionSplit()` exists but uses old shape (no `earnReason`, no `source`, no `salesOrderId`). Needs update for the new column from §1.2.
- **Status:** **HIGH** — `commission_splits` fixture is stale; will silently mask the new column under `Partial<>` overrides until someone notices.

### `commission-rule.integration.test.ts` (NEW, full sale → cancel)
- No file exists.
- Needs: integration trainer context (see §2 gap), tenant-db helpers for seeding service + appointment + sales order, plus the deferred-intent path.
- Existing `pos-commission.test.ts` and `appointment-commission.test.ts` show the cleanup pattern but are siloed per call site.
- **Status:** **HIGH** — missing trainer integration helper + missing combined seed harness.

---

## 4. Acceptance criteria with ZERO coverage (non-trivial)

Ranked by financial/state impact:

1. **CRITICAL — Phase 2 `payouts.runBatch`** (financial mutation, race-condition path, atomicity claim, perm-gating). No `payouts.service.test.ts`, no integration test, no E2E beyond legacy stub assertions.
2. **CRITICAL — Phase 1.6 backfill script** (mass-mutates `commission_splits` across all tenants). See §6.
3. **CRITICAL — Phase 7.2 POS schedule consolidation** (silent math drift). See §5.
4. **HIGH — Phase 5 cancel/freeze/extend mutations** (state-changing, multi-table audit + status-history writes). Promised integration test covers cancel/freeze/unfreeze; *extend* and *markCompleteIfFinal* not in 5.6.
5. **HIGH — Phase 1.7 `sales-order.service.ts:268` conditional void** (financial conditional, no test). Plan §6 says "Get user sign-off before coding 1.7" but no test plan after sign-off.
6. **HIGH — Phase 4.4 RBAC broadening of `listPending`** (security-adjacent — broadens visibility for parent-scoped trainers). No permission-leak regression test.
7. **HIGH — Phase 5 coach-slot weightage trigger** (financial DB constraint). Plan says "verify with test" but doesn't name a file.
8. **HIGH — Phase 2 `payout_management` permission seed** (no admin can access page if seed silently fails).
9. **MEDIUM — Phase 6.2 tax-inclusive revenue KPI** (financial display, no test).
10. **MEDIUM — Phase 7.5 `?? ""` → throw on `callerUserId`** (runtime breakage risk, "deploy to staging first" is not a test).

---

## 5. POS schedule consolidation parity test (Phase 7.2)

Plan §6 explicitly calls out: *"`pos.service.ts` schedule consolidation — risk of subtle math shift. Add a parity test BEFORE the swap that asserts old schedule output equals new schedule output for 6 representative inputs."*

**Status:** **CRITICAL — promised but not in §1.8 or any test list.**

- No existing parity test file (`grep installment.*schedule` in unit/services finds `installment-plan.test.ts` and `installment.test.ts` — neither is a snapshot of `pos.service.ts:587-637`).
- `installment.test.ts` exists at `apps/server/src/tests/unit/services/installment.test.ts` and tests the canonical `createInstallmentSchedule` — perfect base.
- Required: a `pos-installment-schedule-parity.test.ts` that captures the current POS output for 6 inputs (full / half / quarterly / monthly_3 / monthly_6 / custom-bps) and asserts it equals the canonical helper output. Lock BEFORE refactor, delete AFTER.

**Recommendation:** add as a sub-task `7.2a — write parity snapshot test`, blocking 7.2.

---

## 6. Commission backfill script (1.6) — dry-run testability

Plan: *"Dry-run mode default; `--apply` flag to write."*

**Status:** **CRITICAL — no script-level test promised, no precedent for it.**

- Existing backfill scripts in `apps/server/scripts/` (`backfill-appointment-trainer-id.ts`, `backfill-payment-status-history.ts`, `backfill-organization-branches.ts`, `backfill-member-role-id.ts`) — none have a corresponding `.test.ts`. There is no testing convention for backfill scripts in this repo.
- Risk: a dry-run that silently mutates (or an `--apply` that runs by default due to flag-parsing typo) would void commission splits across all tenants. Per §8 risks: *"voiding pending splits across all tenants is a large-impact write."*
- The script touches `commission_splits` financial state and audit rows — exactly the kind of code that requires a unit test of the dry-run guard (assert no `UPDATE` runs without `--apply`) and an integration test of the void-then-resume cycle on one tenant.

**Recommendation:** mandatory pre-merge tests:
1. Unit: `backfill-commission-rule.test.ts` — assert no write calls when `--apply` is absent (mock tenantDb.update spy).
2. Integration: seed a pending POS split where the appointment is still active → run with `--apply` → assert split is `voided` and audit row has `actor='system_backfill'`.

---

## 7. E2E coverage — Journey A and Journey D

### Naming convention from existing `e2e/`:
```
e2e/auth.setup.ts
e2e/batch1..5.dashboard.spec.ts   ← thematic batches, multi-page
e2e/fixes-verification.spec.ts    ← targeted regression bundle
e2e/smoke.spec.ts                 ← thin smoke
```

Convention is `<scope>.spec.ts` (kebab-case scope). No per-journey naming convention; closest precedent is `fixes-verification.spec.ts` for a targeted bundle.

### Journey A — Admin payout
- Existing: `e2e/batch3.dashboard.spec.ts:389-440` already has `test.describe("Payouts View …")` with 4 tests written against the *stub* page (asserts heading visible, no crash).
- **Status:** **MEDIUM** — needs full rewrite to drive `Run Batch` drawer → `previewBatch` → confirm → assert new row appears. Current tests will pass against stub OR new page → false-green risk.
- **Recommendation:** either replace the existing block in `batch3` OR create `e2e/payout-batch.spec.ts` (matches existing scope-name convention) and delete the stub block.

### Journey D — Admin cancels package instance
- **Status:** **HIGH — no e2e file covers this journey.**
- Searched `e2e/` for `package-instance|cancel.*package|freeze` → 0 matches.
- Plan §7 promises Playwright coverage; needs a new spec.
- **Recommendation:** create `e2e/package-instance-lifecycle.spec.ts` covering cancel + freeze + unfreeze + extend (all four mutations from Phase 5).

---

## 8. Summary of CRITICAL / HIGH gaps to fix in plan

Add to plan §1.8 / §2 / §5 / §7 explicit test tasks:

| Severity | Add | Where |
|---|---|---|
| CRITICAL | `payouts.service.test.ts` + `payouts.integration.test.ts` (preview + runBatch + race) | Phase 2.6 (new) |
| CRITICAL | `backfill-commission-rule.test.ts` (dry-run guard) + integration | Phase 1.6 (extend) |
| CRITICAL | `pos-installment-schedule-parity.test.ts` (lock before refactor) | Phase 7.2a (new) |
| HIGH | E2E `e2e/package-instance-lifecycle.spec.ts` (Journey D) | Phase 5.7 (new) |
| HIGH | Replace stub `Payouts View` block in `e2e/batch3.dashboard.spec.ts` (or new `e2e/payout-batch.spec.ts`) | Phase 2.7 (new) |
| HIGH | `makeIntegrationTrainerContext()` helper in `integration-setup.ts` | Phase 1 prereq |
| HIGH | Update `makeCommissionSplit()` fixture for new `earnReason` column | Phase 1.2 |
| HIGH | `listAssignedToMe` RBAC test (trainer A cannot see trainer B's packages) | Phase 4.5 (new) |
| HIGH | `listPending` scope-broadening permission-leak test | Phase 4.4 |
| HIGH | Permission seed test for `payout_management` (admins-only) | Phase 2.5 |
| HIGH | `markCompleteIfFinal` dual-call-site test (installment-confirm + session-complete) | Phase 5.6 |
| HIGH | Coach-slot weightage trigger integration test (assert RAISE on sum != 10000bp) | Phase 5 / 7.14 |
| HIGH | Phase 1.5 branch test — non-bookable POS item still earns at sale | Phase 1.8 |
| HIGH | Phase 1.7 `sales-order.service.ts:268` conditional void test | Phase 1.8 |
| MEDIUM | KPI literal alignment test (`status === 'confirmed'`) — snapshot writer/reader together | Phase 6.6 (new) |
| MEDIUM | Tax-inclusive `salesOrders.kpiSummary` test | Phase 6.6 |

---

## 9. Files referenced

- Plan: `C:\Project\Avantej\zplan\05-12_17-10_sales-pipeline-fixes\plan\plan.md`
- Helpers: `C:\Project\Avantej\apps\server\src\tests\helpers\integration-setup.ts`, `context.factory.ts`, `fixtures.ts`, `db-mock.factory.ts`
- Existing nearest tests:
  - `C:\Project\Avantej\apps\server\src\tests\integration\appointment-commission.test.ts` (completion only)
  - `C:\Project\Avantej\apps\server\src\tests\integration\pos-commission.test.ts` (asserts old rule — must invert)
  - `C:\Project\Avantej\apps\server\src\tests\unit\services\pos.service.test.ts` (walk-in guards)
  - `C:\Project\Avantej\apps\server\src\tests\unit\services\appointment.service.test.ts` (lock-check)
  - `C:\Project\Avantej\apps\server\src\tests\unit\services\package-instance.test.ts` (list/get/create only)
  - `C:\Project\Avantej\apps\server\src\tests\unit\services\installment.test.ts` (canonical schedule — base for parity test)
  - `C:\Project\Avantej\e2e\batch3.dashboard.spec.ts:389-440` (stub Payouts assertions to retire)
- Backfill scripts (no test convention): `C:\Project\Avantej\apps\server\scripts\backfill-*.ts`
