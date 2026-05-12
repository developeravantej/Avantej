# Task Inventory

**Plan:** zplan/04-23_12-38_installment-enhancements/plan/plan.md
**Generated:** 2026-04-23 12:38
**Total tasks:** 24

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Extend `AdminInstallmentOverviewParams.status` type + add `due_soon` filter branch in `getAdminInstallmentOverview` | Agent 1A (backend) | pending |
| 2 | 1 | Extend Zod enum in `adminOverview` router input to include `"due_soon"` | Agent 1A (backend) | pending |
| 3 | 1 | Batch-fetch next-pending installment amount; attach `nextInstallmentAmount`/`nextInstallmentId` to `AdminInstallmentOverviewItem` | Agent 1A (backend) | pending |
| 4 | 1 | Replace in-memory `.length` total with SQL `SELECT COUNT(*)` aggregate in `getAdminInstallmentOverview` | Agent 1A (backend) | pending |
| 5 | 1 | Unit test `due_soon` filter branch in `installment.test.ts` (4 cases) | Agent 1A (backend) | pending |
| 6 | 1 | Add "Due Soon" tab to `installments-page.tsx` STATUS_TABS + extend `statusFilter` union | Agent 1B (frontend) | pending |
| 7 | 1 | Show next-pending installment amount column on Due Soon rows | Agent 1B (frontend) | pending |
| 8 | 1 | Create `apps/web/src/__tests__/pages/packages/` dir + frontend test for Due Soon tab | Agent 1B (frontend) | pending |
| 9 | 2 | Render Next Due + Grace Period Ends rows in Package Info grid; add `daysFromNow` helper | Agent 2 (frontend) | pending |
| 10 | 3 | Add `allowCreditOverdraft` boolean column to `packageInstances` schema | Agent 3 (backend) | pending |
| 11 | 3 | Generate tenant migration 0016_*.sql via `bun --filter @avantej-core/db db:generate:tenant` | Agent 3 (backend) | pending |
| 12 | 3 | Append missing 0016–0029 constants to TENANT_MIGRATIONS array in `migrate-tenant.ts`, then add new 0016 | Agent 3 (backend) | pending |
| 13 | 3 | Type-check clean in packages/db and packages/services after schema change | Agent 3 (backend) | pending |
| 14 | 3 | Add comment to `installment-events.ts` documenting `overdraft_enabled`/`overdraft_disabled` eventType values | Agent 3 (backend) | pending |
| 15 | 4 | Implement `setPackageOverdraft` service function with transaction + audit + event | Agent 4 (backend) | pending |
| 16 | 4 | Export `setPackageOverdraft` from `packages/services/src/index.ts` | Agent 4 (backend) | pending |
| 17 | 4 | Add `setOverdraft` procedure to installments router | Agent 4 (backend) | pending |
| 18 | 4 | Modify `appointment.service.ts:264` condition to honour `allowCreditOverdraft` | Agent 4 (backend) | pending |
| 19 | 4 | Add `query.packageInstances`, `query.installments`, `query.installmentEvents` to mock DB factory | Agent 4 (backend) | pending |
| 20 | 4 | Unit tests for `setPackageOverdraft` (enable, already-enabled no-op, disable, not-found) | Agent 4 (backend) | pending |
| 21 | 4 | Create `appointment.service.test.ts` with overdraft booking cases | Agent 4 (backend) | pending |
| 22 | 4 | Create `installments.integration.test.ts` with setOverdraft integration test | Agent 4 (backend) | pending |
| 23 | 5 | Add Overdraft row to Package Info + toggle button + reason dialog + mutation + table pill | Agent 5 (frontend) | pending |
| 24 | 5 | Add `installments` namespace to `mock-client.ts`; frontend test for overdraft toggle | Agent 5 (frontend) | pending |
