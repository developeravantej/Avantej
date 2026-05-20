# Playwright AUDIT Report — Sales Pipeline Fixes (2026-05-12)

**Plan ref:** `.playwright/test-plan.json` (v1, 20 journeys, branch `feat/package-approval-flow`)
**Audited at:** 2026-05-12
**Phase:** AUDIT (read-only, gap analysis)

---

## Executive Summary

| Metric | Value |
|---|---|
| Total journeys planned | 20 |
| Journeys with any existing coverage | 1 (partial) |
| Journeys completely untested | 19 |
| **Coverage score** | **0.05** |
| Required `data-testid` attributes missing | **~65 across ~17 files** |
| Existing specs flagged for quality issues | 4 specs + the config |
| Biggest blocker | `playwright.config.ts` does NOT wire `auth.setup.ts` as a setup project — no spec consumes a stored auth cookie |

---

## 1. Coverage Gap Analysis

### Per-area coverage map

| Area | Journeys | Covered | Score | Notes |
|---|---:|---:|---:|---|
| branch-onboarding | 1 | 1 (partial) | 0.50 | `branch-onboarding.spec.ts` covers admin-create + invalid token + multi-use + revoke; deliberately stops before form submit. |
| commission-rule | 4 | 0 | 0.00 | `fixes-verification.spec.ts` loads appointment page only; no commission split assertions. |
| payouts | 3 | 0 | 0.00 | Page was a 5-line stub; batch3/4 may smoke-visit but make no KPI/drawer/table assertions. |
| trainer-assigned-packages | 2 | 0 | 0.00 | Tab is new (Phase 4); no spec touches it. |
| package-lifecycle | 3 | 0 | 0.00 | No spec exercises cancel/freeze/extend mutations. |
| sales-cancellation | 4 | 0 | 0.00 | `fixes-verification.spec.ts` and batch2 do NOT cover KPI labels, cancel button, cancelled-sales list, or receipt fallback. |
| pos-checkout | 3 | 0 | 0.00 | No spec exercises the POS create flow at all. |

### Journey → existing-spec map

| Journey ID | Existing spec | Status |
|---|---|---|
| branch-onboarding-full-submit | e2e/branch-onboarding.spec.ts | partial (gaps: no submit, no incognito fill, no cleanup) |
| All 19 others | — | untested |

---

## 2. Selector Audit (CRITICAL)

**Verified by `grep "data-testid" apps/web/src` (2026-05-12):** 13 occurrences across 4 files, ALL in tests or `empty-state.tsx`. **Zero production components in any of the planned-journey paths have a `data-testid`.**

All ~65 required test IDs must be added by EXECUTE. Group by component file to minimise PRs:

### Trivial (single-file, 1-3 attributes each)

| Component file | Test IDs to add |
|---|---|
| `apps/web/src/features/branch-invites/components/qr-code-card.tsx` | `generate-qr-button`, `invite-url-input` |
| `apps/web/src/routes/onboarding.$token.tsx` | `onboarding-branch-name`, `onboarding-name-input`, `onboarding-email-input`, `onboarding-password-input`, `onboarding-submit-button` |
| `apps/web/src/features/payouts/components/payouts-kpi-strip.tsx` | `payouts-kpi-strip`, `payouts-kpi-pending`, `payouts-kpi-approved`, `payouts-kpi-paid` |
| `apps/web/src/features/payouts/components/payouts-table.tsx` | `payouts-table` |
| `apps/web/src/features/my-services/components/assigned-package-drawer.tsx` | `assigned-package-drawer`, `drawer-client-name`, `drawer-service-name` |
| `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx` + `apps/web/src/components/app-sidebar.tsx` | `cancelled-sales-table`, `sidebar-cancelled-sales` |
| `apps/web/src/features/packages/components/cancel-instance-dialog.tsx` | `cancel-instance-dialog`, `cancel-reason-input`, `cancel-instance-confirm-button` |
| `apps/web/src/features/packages/components/freeze-instance-dialog.tsx` | `freeze-instance-dialog`, `freeze-until-input`, `freeze-instance-confirm-button` |
| `apps/web/src/features/packages/components/extend-instance-dialog.tsx` | `extend-instance-dialog`, `extend-days-input`, `extend-instance-confirm-button` |

### Small (1 file, 3-5 attributes, may need a column verification)

| Component file | Test IDs to add | Notes |
|---|---|---|
| `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx` | `cancel-sale-button`, `cancel-sale-dialog`, `cancel-sale-reason-input`, `cancel-sale-confirm-button`, `print-receipt-button`, `receipt-unavailable-message` | Code already wires CancelSaleDialog (per plan inspection). |
| `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx` (or KPI sub-component) | `sales-kpi-strip`, `sales-kpi-confirmed`, `sales-kpi-revenue` | Verify which file actually owns the KPI strip. |
| `apps/web/src/features/payouts/components/run-batch-drawer.tsx` (+ payouts/view.tsx for trigger) | `run-batch-button`, `run-batch-drawer`, `batch-staff-combobox`, `batch-period-start`, `batch-period-end`, `batch-preview-count`, `batch-confirm-button` | |
| `apps/web/src/features/my-services/components/assigned-packages-table.tsx` (+ my-services/view.tsx) | `tab-assigned-packages`, `assigned-packages-tab`, `assigned-packages-table`, `assigned-packages-empty` | |
| `apps/web/src/components/pages/commissions/all-tab.tsx` | `commission-earn-reason-badge`, `commission-status-badge` | **VERIFY first**: does the column actually surface `earnReason`? Plan flagged this as needing inspection. If column missing, add column before testid. |
| Appointment dialogs in `apps/web/src/features/appointments/components/` (likely `AppointmentDetailDialog.tsx`, `OccurrenceActionDialog.tsx`, `AttendanceDialog.tsx`) | `appointment-cancel-button`, `appointment-cancel-confirm-button`, `appointment-complete-button` | Confirm which dialog owns each action; the file set is ambiguous. |

### Medium (multi-file POS flow + lifecycle table)

| Component file | Test IDs to add |
|---|---|
| `apps/web/src/routes/_authenticated/dashboard/_layout/sales/create.tsx` + child step components (member step, catalog step, payment step, success screen — likely under `apps/web/src/features/pos/` or inline) | `pos-member-search-input`, `pos-add-service-button`, `pos-add-product-button`, `pos-catalog-item`, `pos-payment-method-installment`, `pos-installment-plan-select`, `pos-complete-sale-button`, `pos-sale-success-screen`, `pos-sale-success-id`, `pos-error-toast` |
| `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx` + session-packs row component (find via grep) | `instances-table`, `instance-action-menu`, `instance-action-cancel`, `instance-action-freeze`, `instance-action-unfreeze`, `instance-action-extend`, `instance-expires-at`, `status-filter-active`, `status-filter-frozen`, `status-filter-cancelled` |

**Total: ~65 attributes across ~17 component files.** Each is a `data-testid="..."` JSX attribute add — trivial individual edits, but the surface area is large.

---

## 3. Quality Issues in Existing Specs

### HIGH severity

**`playwright.config.ts` — auth.setup.ts is orphaned**

```ts
// Current: 3 projects, none reference setup, none use storageState
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] }, testMatch: /\.(smoke|fixes-verification)\.spec\.ts/ },
  { name: "dashboard-e2e", use: { ...devices["Desktop Chrome"] }, testMatch: /\.dashboard\.spec\.ts/ },
  { name: "onboarding-e2e", use: { ...devices["Desktop Chrome"] }, testMatch: /branch-onboarding\.spec\.ts/ },
]
```

Consequences:
- `e2e/.auth/user.json` is never produced.
- All batch1-5 specs fall back to a per-test `login()` helper that performs full UI login. With ~50+ tests across 5 files, this is a large wall-clock penalty and a flake source.
- `e2e/smoke.spec.ts` test "dashboard loads after auth" navigates to `/dashboard` with NO authentication at all — the assertion `toHaveURL(/dashboard/)` may pass against a `/login?from=/dashboard` redirect URL because of the loose regex. Misleading.

**Fix in EXECUTE day 1:**
```ts
projects: [
  { name: "setup", testMatch: /auth\.setup\.ts/ },
  { name: "dashboard-e2e", dependencies: ["setup"], use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/tenant-admin.json" }, testMatch: /\.dashboard\.spec\.ts/ },
  { name: "journeys-e2e", dependencies: ["setup"], use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/tenant-admin.json" }, testMatch: /\.journey\.spec\.ts/ },
  // keep onboarding-e2e without storageState since it needs incognito
]
```
Rename `e2e/.auth/user.json` → `e2e/.auth/tenant-admin.json` in `auth.setup.ts`.

### MEDIUM severity

- **`fullyParallel: false` + `workers: 1`** in playwright.config.ts. With 20 new journeys this serial execution will dominate CI time. Read-only smoke can safely run parallel; mutation-based journeys may need a dedicated tenant or sequential project.
- **`e2e/smoke.spec.ts`** "dashboard loads after auth" test is not actually authenticated. Either delete or wire to setup project.
- **`e2e/batch1-5.dashboard.spec.ts`** every describe runs `login()` in `beforeEach` — should migrate to `storageState` in a follow-up cleanup (do not delete now; they provide smoke coverage).

### LOW severity

- `e2e/branch-onboarding.spec.ts:163` and `:326` use `page.waitForTimeout(2_000)` and `(1_500)`. Replace with web-first assertions once testids are added.
- `e2e/batch5.dashboard.spec.ts:336` uses `page.waitForTimeout(1_000)`. Same fix.
- `e2e/branch-onboarding.spec.ts` extracts the invite URL via 3-tier text/regex/anchor fallback. Once `data-testid="invite-url-input"` exists, replace with `page.getByTestId("invite-url-input").inputValue()`. Do NOT rewrite the spec — just simplify the helper.

### No issues found

- No spec uses raw `.class-name` CSS selectors.
- No spec is missing assertions entirely.
- All assertions use Playwright web-first `expect()` patterns (good).

---

## 4. Seed Infrastructure Assessment

### `e2e/helpers/seed-data.ts` (to be created in EXECUTE)

| Helper | Purpose | Approach | Complexity |
|---|---|---|---|
| `createTestUser({ email, password, role })` | branch-onboarding-full-submit | better-auth signUp via existing public oRPC; cleanup via direct DB delete (no oRPC delete exists) | medium |
| `cleanupTestUser(email)` / `cleanupByEmailPrefix("testuser+")` | branch-onboarding-full-submit teardown | **No `users.delete` oRPC procedure exists** (verified by grep). Implement as `apps/server/scripts/e2e-cleanup.ts` bun CLI; tests invoke via `execSync`. | small |
| `seedAppointment({ trainerId, customerId, serviceId, status })` | commission-rule-cancel-appointment, commission-rule-complete-appointment | Use `client.appointments.create` for booking; status transitions go via normal UI mutations. **Blocker:** test tenant has no trainer member — admin franchisee@ is `role=admin`. Decide: (a) tweak admin role in DB to act as trainer, or (b) seed a dedicated trainer member. Direct DB insert needed for seeded "confirmed"-state appointment. | large |
| `seedApprovedCommissionSplit({ staffId, amount, periodStart, periodEnd })` | payouts-confirm-creates-row, payouts-run-batch-drawer (preview > 0) | No oRPC for arbitrary split creation. Direct tenant DB INSERT into `commission_splits` (status='approved'). | medium |
| `seedPackageInstance({ ownerId, serviceId, assignedTrainerId, status })` | trainer-assigned-packages-drawer, package-lifecycle-* (fallback), pos-checkout-package-salesorderid (verification) | **Prefer** creating via `client.salesOrders.create` to exercise real path. Fall back to direct DB insert for `assignedTrainerId=admin` scenarios that POS won't allow. | medium |
| `ensureInstallmentPlanExists()` | pos-checkout-installment-schedule precondition | Idempotent — check via oRPC, create via existing settings router if missing. | small |

### Direct-DB vs oRPC preference

- **oRPC preferred** for any operation that has a procedure (sales orders, appointments, settings, signUp).
- **Direct DB writes** only for: status-prefilled seed data (e.g. confirmed appointment), commission_splits (no public mutation), and user deletion (no procedure).
- Direct-DB helpers should live in `apps/server/scripts/e2e-*.ts` bun CLIs invoked from the test via `execSync` — keeps Playwright code free of Node DB clients.

---

## 5. Recommended EXECUTE Strategy

### Day 1 — Foundation (config + selectors, no specs yet)

1. Fix `playwright.config.ts`: add `setup` project, add `storageState` to dashboard-e2e + new `journeys-e2e` project.
2. Rename `e2e/.auth/user.json` → `e2e/.auth/tenant-admin.json` in `auth.setup.ts`.
3. Verify cookie persistence by running ONE existing batch test under the new wiring before broader changes.
4. Add `data-testid` attributes file-by-file in 4 commit groups:
   - **Group A (trivial, 6 files):** branch-invites/qr-code-card.tsx, onboarding.$token.tsx, payouts-kpi-strip.tsx, payouts-table.tsx, assigned-package-drawer.tsx, cancelled-sales/view.tsx + app-sidebar.tsx
   - **Group B (small, 4 files):** cancel/freeze/extend-instance-dialog.tsx, sales/$id.tsx
   - **Group C (small, 3 files):** sales/view.tsx (KPIs), my-services/view.tsx + assigned-packages-table.tsx, run-batch-drawer.tsx + payouts/view.tsx
   - **Group D (medium, 4 files):** packages/view.tsx + session-packs row component, commissions/all-tab.tsx (verify earnReason column FIRST), appointment dialogs, sales/create.tsx + POS step components

### Day 2 — No-seed specs (10 journeys)

Write the journeys listed in plan's `seedingRequiredVsNot.achievableWithoutSeedHelpers`:
- payouts-kpi-mounts, payouts-run-batch-drawer
- trainer-assigned-packages-tab-loads
- package-lifecycle-cancel/freeze-unfreeze/extend
- sales-cancellation-kpi-confirmed/cancel-sale/cancelled-list
- pos-checkout-non-client-member-error

Skip `sales-cancellation-receipt-fallback` (P2 — non-deterministic without DB mutation).

File layout: one spec per area (e.g. `e2e/payouts.journey.spec.ts`, `e2e/package-lifecycle.journey.spec.ts`). All under `journeys-e2e` project with storageState.

### Day 3 — Seed infrastructure + remaining journeys

1. Build `e2e/helpers/seed-data.ts` + `apps/server/scripts/e2e-cleanup.ts`.
2. Decide trainer-member strategy (admin role tweak vs dedicated seed member). Get user sign-off.
3. Write the 9 seed-dependent journeys (branch-onboarding-full-submit, commission-rule-*, payouts-confirm-creates-row, trainer-assigned-packages-drawer, pos-checkout-package-salesorderid, pos-checkout-installment-schedule).

### Day 4 — Verification + flake hunt

- Run full suite 3x.
- Replace remaining `waitForTimeout` calls with web-first assertions.
- Triage any flakes — likely candidates: drawer animations, debounced preview API, navigation timing post-mutation.

---

## 6. Things to Preserve (do NOT rewrite)

- **`e2e/branch-onboarding.spec.ts`** — keep all 5 existing tests. Add the new full-submit journey as a 6th test (or sibling `branch-onboarding.journey.spec.ts`). Existing admin-create + invalid-token + multi-use + revoke specs are useful coverage.
- **`e2e/batch1-5.dashboard.spec.ts`** — keep as smoke. Migrate to storageState in a follow-up; do not rewrite assertions.
- **`e2e/fixes-verification.spec.ts`** — keep; new journey specs are complementary.

---

## Report-Back Summary

- **Coverage score:** 0.05 (1 of 20 partially covered).
- **Missing-selector count:** ~65 attributes across ~17 component files.
- **Biggest blocker:** `playwright.config.ts` does not register `auth.setup.ts` as a setup project and no project consumes `storageState` — fix this on Day 1 before adding any new spec, otherwise EXECUTE will repeat the slow per-test UI-login pattern.
- **Recommended EXECUTE order:** (1) fix config wiring, (2) add testids in 4 file-groups, (3) write 10 no-seed P0/P1 specs, (4) build seed helpers, (5) write 9 seed-dependent specs, (6) flake hunt. Skip `sales-cancellation-receipt-fallback` (non-deterministic).
