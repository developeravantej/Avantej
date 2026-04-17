# Dynamic Installment Plans + Installments View Filters

**Date:** 2026-04-17
**Branch:** Customer-app
**Source plan:** `zplan/17-04_10-46_dynamic-installment-plans/plan.md`
**Phase 5 (native app):** SKIPPED per user instruction.

---

## Outcome

Installment plans are now admin-configurable per tenant via a new `installment_plans` table. The admin Installments view gained search / date-range / plan-code filters. Existing `full | half | quarterly` data and flows are fully preserved — enum-to-string widening is backward compatible.

## Phases Delivered

| Phase | Status | Summary |
|---|---|---|
| 1 — Schema + CRUD | Done | `installment_plans` table, seed migration, service layer, router, 21 unit + 11 integration tests |
| 2 — Plan-resolution refactor | Done | `createInstallmentSchedule` now takes `installmentsTotal: number`; routers widened from Zod enum to string with plan-code validation |
| 3 — Settings UI + sidebar + dynamic service form | Done | New settings page, sidebar link, dynamic checkbox list, fixed data-table cast |
| 4 — Installments view filters | Done | Search (clientId prefix / purchase number), date-range pickers, plan dropdown, extended `adminOverview` procedure |
| 5 — Native app sync | **SKIPPED** | Backend is backward-compatible; native continues to work with legacy codes until synced later |
| 6 — Verification | Done | Type-check clean of new errors (1 introduced + fixed); unit tests pass; lint clean |

---

## Files Created (10)

- `packages/db/src/schema/tenant/installment-plans.ts`
- `packages/services/src/installment-plan.service.ts`
- `packages/api/src/routers/installment-plans.ts`
- `packages/db/src/migrations/tenant/0012_military_captain_marvel.sql`
- `apps/server/src/tests/unit/services/installment-plan.test.ts`
- `apps/server/src/tests/integration/installment-plans.integration.test.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx`
- `zdocs/17-04_dynamic-installment-plans_result.md` (agent work log)

## Files Modified (12)

- `packages/db/src/schema/tenant/index.ts` — re-export
- `packages/services/src/index.ts` — re-export
- `packages/api/src/routers/index.ts` — register `installmentPlans` in `baseRouter`
- `packages/db/src/migrate-tenant.ts` — `MIGRATION_0017_INSTALLMENT_PLANS` constant embedded + appended to `TENANT_MIGRATIONS`
- `packages/services/src/installment.service.ts` — `CreateInstallmentScheduleParams` takes `installmentsTotal`; `getAdminInstallmentOverview` gained 4 filter params
- `packages/api/src/routers/package-instances.ts` — plan resolved by code at handler; interval precedence rule (`service.installmentIntervalDays ?? plan.defaultIntervalDays ?? 30`)
- `packages/api/src/routers/services.ts` — `availablePaymentPlans` widened to `string[]` with existence validation
- `packages/api/src/routers/installments.ts` — `adminOverview` accepts `search / dueBefore / dueAfter / paymentPlanCode`
- `apps/web/src/components/app-sidebar.tsx` — sidebar link under Config
- `apps/web/src/components/forms/service-form.tsx` — dynamic checkboxes via `client.installmentPlans.list`; `plansMap` + `isInstallmentSelected` gating
- `apps/web/src/components/tables/service/view/data-table.tsx` — cast widened to `string[]`
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx` — filter row, debounced search, typed `plansMap`
- `apps/server/src/tests/unit/services/installment.test.ts` — updated to pass `installmentsTotal` instead of `paymentPlanType`

---

## Schema

```typescript
installment_plans (
  id uuid PK,
  code text UNIQUE,            // 'full', 'half', 'quarterly', or tenant-defined
  name text,                   // display
  num_installments integer,    // >= 1
  default_interval_days integer DEFAULT 30,
  description text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at / updated_at timestamptz
)
```

Seeded on migration:
- `full` → 1 installment (default)
- `half` → 2 installments
- `quarterly` → 4 installments

`package_instances.paymentPlanType` stays as free-form `text` storing the plan **code** — no FK. Historical rows remain valid because seed codes exactly match legacy literals.

---

## Permission

Reused `service_management` resource (not a new `installment_plan_management`) — matches sibling routers and avoids a permission-seed migration.

---

## Critical Decisions

- **Migration numbering**: Internal constant is `MIGRATION_0017_INSTALLMENT_PLANS` (sequence aligned with existing constants in `migrate-tenant.ts` beyond 0011); generated SQL file is `0012_military_captain_marvel.sql`. Hash `0017_installment_plans` is appended last in `TENANT_MIGRATIONS`, so `LATEST_MIGRATION_VERSION` reflects it automatically.
- **`code` is immutable after creation** — rename would orphan historical rows.
- **`numInstallments < 1`** rejected at service layer; router converts to BAD_REQUEST.
- **Deactivation** silently clears `isDefault` (tax-rates pattern); UI warns if plan is referenced by active services.
- **Interval precedence**: `service.installmentIntervalDays ?? plan.defaultIntervalDays ?? 30` — resolved at handler.
- **Orphan codes** (historical rows referencing deactivated plan): UI falls back to raw-code display.

---

## Before Browser Testing

Apply the tenant migration to dev DB. Either:
1. Start server — migration runner applies on tenant DB connection, OR
2. `cd packages/db && npx drizzle-kit push --config=drizzle.tenant.config.ts`

Verify `installment_plans` table in Drizzle Studio has the 3 seeded rows.

## Test Credentials

- Tenant DB: `franchisee@gmail.com` / `password123`
- Test org: `996febce-aaad-4ded-8f47-02d2b566c8ee`

---

## Verification Results

- **Type check** (apps/web + apps/server + packages): 1 new error introduced during Phase 4 (untyped `plansMap` inference) — fixed by adding explicit `Map<string, {code, name, numInstallments}>` type annotation. All other errors are pre-existing and unrelated.
- **Unit tests**: `installment-plan.test.ts` (21 tests) + `installment.test.ts` (10 tests) = 31 pass. Broader suite has 18 pre-existing failures from missing `TENANT_DATABASE_URL` (integration setup) and 5 from unrelated auth `verifyEmailToken` tests.
- **Lint** (oxlint): 0 new warnings.
- **Integration tests**: new `installment-plans.integration.test.ts` wired up; runs only when `TENANT_DATABASE_URL` is set.

---

## Follow-ups (deferred)

1. Native app (Phase 5) — plan cards + purchase-flow context + pay step. Currently falls back to legacy `full/half/quarterly` behavior.
2. Split to dedicated `installment_plan_management` permission resource (requires permission-seed migration).
3. Customer name search in Installments view (needs cross-DB join).
4. Lock `numInstallments` mutation once a plan is referenced by any `package_instance` (prevents retroactive desync).
5. Index on `package_instances.payment_plan_type` if filter performance suffers at scale.
6. Update `zhub/pages/*` docs for the three pages touched (`packages-installments-view`, `settings-installment-plans` new, `service-view`, `service-form`).

---

## Rollback

Additive schema + enum-widening = localized rollback per phase:
- Phase 1: drop `installment_plans` table; revert service/router index + registrations.
- Phase 2: revert 3 router files + `installment.service.ts` diff; old enum becomes valid again.
- Phase 3/4: revert web diffs (no backend impact).

Seed is idempotent (`ON CONFLICT (code) DO NOTHING`), so re-running the migration is safe.
