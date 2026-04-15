# Schema Consolidation Finalization — Overview (Revised)

**Date:** 2026-04-12
**Branch:** `Customer-app`
**Scope:** `apps/server` and `apps/web` only
**Status:** Schema source and application code are complete. This plan closes out the DB migration, fixes one web bug, runs the test suites, and does a UI smoke test. **Plan revision 2** incorporates fixes for:
- Critical ordering flaw in the original plan (data-write script ran before target columns existed)
- Three schema correctness issues found during review (partial-refund data loss, orphaned `package_assignment_id` column, silent drop of `packages.appointment_type` / `price_per_session`)
- New execution model: one atomic hand-written SQL migration applied via Neon CLI instead of a separate TS data-migration script

---

## 1. What changed in this revision

### Approach change
The original plan had two artifacts:
1. A TypeScript data-migration script (`migrate-schema-consolidation.ts`) that read from legacy tables and wrote to new columns
2. A Drizzle-generated SQL migration that did the DDL (drops + adds)

That split is broken because the script wrote through typed Drizzle builders targeting columns that didn't exist in the live DB yet. It couldn't run.

**New approach:** one atomic SQL migration file, hand-written and applied via Neon CLI. The file does DDL (ADD COLUMN nullable) → DATA (UPDATE backfill from legacy tables) → DDL (add constraints) → CLEANUP (DROP TABLE + DROP COLUMN) in a single transaction. The TS script is deleted.

### Schema correctness fixes added to the migration
While double-checking the schema, three issues surfaced that the original plan didn't address:

**1. Partial-refund data loss (BUG — schema change required)**

`packages/services/src/sales-order.service.ts:167` — `cancelSalesOrder` accepts a `refundAmount: number` parameter:
```ts
params: { cancelledBy: string; reason?: string; refundAmount: number }
```

But the implementation silently drops it — `refundAmount` is never written to the database. The legacy `cancelled_sales` table had a `cancelled_amount integer NOT NULL` column for this. The new `sales_orders` schema has no equivalent, and the `cancelled-sales` router returns `cancelledAmount: row.totalAmount` unconditionally — wrong for any partial cancellation.

**Fix:** Add `cancelledAmount integer` column to `sales_orders`. Persist `refundAmount` in `cancelSalesOrder`. Return the real value from the router. This is a ~4-line code change plus one schema column.

**2. Lost `packages.appointment_type` and `price_per_session`**

The legacy `packages` table had `appointment_type text NOT NULL`, `price_per_session integer NOT NULL`, and `max_clients_per_session integer NOT NULL`. The migration only copies `session_count`, `expiry_days`, `expiry_date`. The other three are dropped with the table.

For a package matched to an existing service by name, the service's own `type`, `price`, and `maxAttendees` are preserved — but there's no guarantee they match what the package originally had. A package with `appointment_type = 'semi_private'` matched against a service with `type = 'private'` silently loses the semi_private classification.

**Fix in the migration:** For packages that have a matching service, the SQL backfill COALESCEs the package fields into the service where the service's own value is the default (e.g. `type = 'private'`, `price IS NULL`). For packages without a matching service, **log as pre-flight warnings** and require manual resolution before the migration runs. The plan includes a pre-flight query in Phase 2.

**3. `appointment_clients.package_assignment_id` orphan column — DECISION: Option A (rename + re-FK)**

User confirmed group classes can have multiple clients each drawing from their own pack. This means per-client credit tracking at the `appointment_clients` level is required.

**Fix:** Rename the column to `package_instance_id`, NULL out legacy UUID data (it pointed at the dropped `package_assignments` table and is no longer valid), and add a new FK to `package_instances.id`. Historical "which pack did this client draw from" data is lost — mock data only, acceptable.

Phase 1 Task 1.7 is now **mandatory**, not opt-in. The SQL migration includes the rename inline.

---

## 2. Goals & Success Criteria

### Goals
1. Write one consolidated SQL migration file that applies all DDL and data backfill atomically.
2. Apply the migration via Neon CLI (not `bun db:migrate`) so the rollback path is a Neon branch restore.
3. Fix the `packages/instances/view.tsx` render-path bug.
4. Fix the partial-refund data loss in `cancelSalesOrder` and the `cancelled-sales` router.
5. Verify the entire test suite passes.
6. Manually verify each of the 5 affected UI flows.

### Success criteria
- [ ] One SQL file at `packages/db/src/migrations/0010_schema_consolidation.sql` containing DDL + backfill + constraints + cleanup in a single transaction
- [ ] File applied via Neon CLI against dev tenant DB without error
- [ ] Drizzle migration journal (`__drizzle_migrations` table + `meta/_journal.json`) updated so `bun db:migrate` doesn't try to re-apply
- [ ] `sales_orders.cancelled_amount` column exists and is populated
- [ ] `cancelSalesOrder` persists `refundAmount` to the new column
- [ ] `cancelled-sales` router returns the persisted amount (not `totalAmount`)
- [ ] Web instances page renders without crashing and shows human-readable service names
- [ ] `cd apps/server && bun test` and `cd apps/web && bun test` both pass
- [ ] 5 UI smoke-test flows verified
- [ ] `bun check` and `bun check-types` green
- [ ] Neon backup branch recorded in PR description

---

## 3. Scope

### In scope
- Write and hand-review `packages/db/src/migrations/0010_schema_consolidation.sql`
- Update drizzle migration journal (`meta/_journal.json` + `__drizzle_migrations` row)
- **Delete** `apps/server/scripts/migrate-schema-consolidation.ts` (replaced by SQL migration)
- Add `cancelledAmount integer` column to `packages/db/src/schema/tenant/sales-orders.ts`
- Fix `cancelSalesOrder` in `packages/services/src/sales-order.service.ts` to persist `refundAmount`
- Fix `cancelledSales` router in `packages/api/src/routers/cancelled-sales.ts` to return the persisted amount
- Fix `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` render bug
- Run full test suites and fix regressions
- Smoke-run seed scripts
- Read-through of `inspect-and-cleanup-test-data.ts` and `test-write-endpoints.ts`
- Manual UI walkthrough
- Execute Neon CLI commands: branch snapshot, SQL file apply, verification queries

### Out of scope
- `packages/db/src/migrate-tenant.ts` embedded migration update (tracked as follow-up)
- `apps/native` (separate branch)
- `docs/SCHEMA_CONSOLIDATION.md` updates (non-blocking; do in follow-up)
- `appointment_clients.package_assignment_id` rename (optional task; requires user go-ahead)
- Production/staging rollout (dev only)

---

## 4. Plan Structure

| File | Phase | Goal |
|---|---|---|
| `00-overview.md` | — | This document |
| `01-phase1-write-migration-sql.md` | Phase 1 | Hand-write the atomic SQL migration + source schema fix for `cancelled_amount` + service/router fixes |
| `02-phase2-apply-via-neon-cli.md` | Phase 2 | Neon CLI backup branch → apply SQL → verify → update drizzle journal |
| `03-phase3-fix-instances-view.md` | Phase 3 | Fix `packages/instances/view.tsx` render bug (unchanged from v1) |
| `04-phase4-verify-tests-and-seeds.md` | Phase 4 | Run test suites, smoke-run seed and cleanup scripts |
| `05-phase5-ui-smoke-test.md` | Phase 5 | Manual walkthrough of 5 affected UI flows (unchanged from v1) |
| `06-impact-and-breakage.md` | — | Caller trace, deployment coupling, rollback per-phase |
| `07-risks-and-rollback.md` | — | Open questions, risks, rollback strategy |

---

## 5. Execution Order

```
Phase 1 (hand-write SQL + source schema fix)
   ↓
Phase 2 — Neon CLI flow:
   ├─ neon branches create (snapshot dev)
   ├─ neon connection-string → psql pre-flight queries
   ├─ psql apply migration file (one transaction)
   ├─ psql verification queries
   └─ insert row into __drizzle_migrations to keep drizzle state consistent
   ↓
Phase 3 (web fix — independent but test after Phase 2)
   ↓
Phase 4 (test + seed verification)
   ↓
Phase 5 (manual UI walkthrough)
```

Phases run strictly in order. The critical edge is **the migration SQL file must be correct before Phase 2 applies it** — once `DROP TABLE packages` runs, legacy data is gone. The Neon branch snapshot created at the start of Phase 2 is the rollback insurance.

---

## 6. Why Neon CLI instead of `bun db:migrate`?

Three reasons:

1. **Hand-written migrations are first-class on Neon CLI, not on drizzle-kit.** drizzle-kit generates migrations by diffing source against journal state. Hand-written migrations work through drizzle but are easier to reason about when applied directly. Any hand-edit to a drizzle-generated file also confuses future `db:generate` runs unless the journal is carefully managed.
2. **Branch snapshots are free.** Neon CLI `neon branches create` creates a point-in-time copy instantly and costs nothing until written to. Rolling back is one command. This is superior to the existing `backup-tenant-tables.ts` script which only dumps `hierarchy_nodes` and `members` to JSON.
3. **Atomic via transaction.** A single `psql -f migration.sql` runs in one implicit transaction. If any statement fails, everything rolls back. drizzle-kit's migrator runs each statement separately and can leave the DB in a half-applied state.

The tradeoff: we manually insert into `__drizzle_migrations` to keep drizzle's state consistent. This is a ~3-line SQL insert. Phase 2 includes it.
