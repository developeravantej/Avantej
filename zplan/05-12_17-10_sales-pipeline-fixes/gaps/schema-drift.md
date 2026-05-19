# Schema-Drift Audit — Sales Pipeline Fixes

**Plan:** `zplan/05-12_17-10_sales-pipeline-fixes/plan/plan.md`
**Auditor:** schema-drift agent
**Run date:** 2026-05-12
**Scope:** all DDL (tables, columns, FKs, enums, indexes) cited by §3 / §5 / Phase 1 / Phase 5 of the plan, verified against `packages/db/src/schema/tenant/` and `packages/db/src/migrations/tenant/`.

---

## Severity Summary

| Severity | Count |
|---|---|
| CRITICAL | 3 |
| HIGH     | 2 |
| MEDIUM   | 3 |
| LOW      | 1 |
| INFO     | 4 |

---

## CRITICAL findings (migration will fail on deploy)

### C-1. `package_instance_status` is NOT a Postgres ENUM type
**Plan ref:** §3 migration step 1, Phase 5 task 5.1.
**Plan claim:**
```sql
ALTER TYPE package_instance_status ADD VALUE IF NOT EXISTS 'frozen';
ALTER TYPE package_instance_status ADD VALUE IF NOT EXISTS 'completed';
```
**Reality:** `package_instances.status` is a plain `text("status")` column (see `packages/db/src/schema/tenant/package-instances.ts:58`). No `CREATE TYPE package_instance_status` exists anywhere in `packages/db/src/migrations/tenant/`. `ALTER TYPE` on a non-existent type fails with `type "package_instance_status" does not exist`.
**Impact:** Migration `0010_sales_pipeline_fixes.sql` will hard-fail on first run, blocking every other change in the same file.
**Fix:** Drop the `ALTER TYPE` block. Since status is `text`, no schema change is needed to support `'frozen'` / `'completed'`. (Optional: add a CHECK constraint enumerating the allowed strings.) Update the plan's status diagram accordingly.

### C-2. `installment_payment_method` is NOT a Postgres ENUM type either
**Plan ref:** §3 migration step 6.
**Plan claim:**
```sql
ALTER TYPE installment_payment_method ADD VALUE IF NOT EXISTS 'card', 'fpx', 'stripe';
```
**Reality:** `installments.paymentMethod` is `text("payment_method")` (see `packages/db/src/schema/tenant/installments.ts:15`, comment says `'manual_transfer' | 'cash'` but it's a free text col). No matching `CREATE TYPE` exists.
**Impact:** Same as C-1 — migration fails.
**Fix:** Remove the `ALTER TYPE` block. `card`/`fpx`/`stripe` strings can be written directly to the text column. Phase 7 task 7.11 ("surface in UI dropdown") still works without any DDL.

### C-3. Migration filename collision — `0010` already taken
**Plan ref:** §3 ("Single new SQL file `packages/db/src/migrations/tenant/0010_sales_pipeline_fixes.sql`").
**Reality:** Existing migrations include:
- `0010_broad_ronan.sql`
- `0011_clear_marvex.sql` and `0011_installments.sql`
- ...all the way through `0050_add_is_recurring_idx.sql`
The current latest is **0050** (with multiple cases of duplicate prefixes already in the tree).
**Impact:** Filename collision. `bun gen:migrations` may or may not de-dupe (current tree shows two `0011_*` and two `0014_*` files), but ordering becomes non-deterministic and `verify:migrations` may flag drift.
**Fix:** Use `0051_sales_pipeline_fixes.sql` (next sequential). Update the plan and §3 SQL header.

---

## HIGH findings (data integrity / FK risk)

### H-1. `assignedTrainerId` currently has no FK — type matches `members.id` but plan's FK target needs verification
**Plan ref:** §3 migration step 4.
**Plan claim:** `ADD CONSTRAINT … FOREIGN KEY (assigned_trainer_id) REFERENCES members(id) ON DELETE SET NULL`.
**Reality:**
- `package_instances.assignedTrainerId` is `uuid("assigned_trainer_id")` with NO existing FK reference (see `package-instances.ts:63`). Good — FK is addable.
- `members.id` is `uuid("id").primaryKey().defaultRandom()` (see `members.ts:30`). Primary key implies a UNIQUE CONSTRAINT, so the FK target is valid (per CLAUDE.md "FKs are allowed only if the target column has a unique CONSTRAINT (not just a unique INDEX)").
- **Risk:** If any orphaned rows exist (an `assigned_trainer_id` value that doesn't match any `members.id`), the `ADD CONSTRAINT` will fail. The plan does not include a pre-flight cleanup step.
- A neighboring schema, `preferredTrainerId` (line 64), already has the FK to `members.id` — so the convention works.
**Fix:** Add a Phase 5 sub-task: pre-flight `SELECT count(*) FROM package_instances WHERE assigned_trainer_id IS NOT NULL AND assigned_trainer_id NOT IN (SELECT id FROM members)`. If non-zero, NULL them out (or document with admin) before applying the FK. Wrap the constraint add in a `NOT VALID` then `VALIDATE CONSTRAINT` if needed.

### H-2. `frozenUntil` column does not exist on `package_instances`
**Plan ref:** §3 API contract table (`freeze` returns `{ frozenUntil }`); Phase 5 task 5.1 ("`frozenUntil` column on `package_instances`"); Phase 5 §"Files affected" mentions adding it to `packages/db/src/schema/tenant/packages.ts`.
**Reality:**
- No `frozen_until` / `frozenUntil` column anywhere in the codebase outside the plan itself.
- Worse: there is no `packages/db/src/schema/tenant/packages.ts` file (packages were absorbed into `services.ts` per the existing schema). The plan's "Files affected" path is wrong.
- The `0010_sales_pipeline_fixes.sql` snippet in §3 also does NOT include the `ADD COLUMN frozen_until` statement — it's only mentioned in prose.
**Impact:** Plan is inconsistent with itself; the freeze procedure can't persist `frozenUntil` because the column won't be created. Membership-holds workflow may already cover "freeze" semantics — see `membership-holds.ts` (added in migration `0040_add_membership_holds.sql`).
**Fix:** Either (a) add `frozen_until timestamptz` column to `package_instances` in the migration AND in `packages/db/src/schema/tenant/package-instances.ts`, OR (b) reuse `membership_holds` table and drop the `frozenUntil` column concept entirely. Decision should go in Open Questions.

---

## MEDIUM findings (name mismatch / runs but lies)

### M-1. `sessionsRemaining` is named `creditsRemaining`
**Plan ref:** §3 trainer assigned-packages query, journey B, plan-wide.
**Reality:** The column is `credits_remaining` (`package-instances.ts:48-50`), a generated column derived from `COALESCE(credits_unlocked, credits_total) - credits_used`. There is no `sessions_remaining` column.
**Fix:** In API design and UI labels, either map `creditsRemaining` → "Sessions remaining" in the response, or rename in plan to `creditsRemaining`. Trivial in code but the plan's wording is misleading.

### M-2. `commission_pending_intents` table does not exist
**Plan ref:** §"Open Q-2" Option A; task 1.4.
**Reality:** No such table or schema file. The plan correctly defaults to Option B (use `sales_order_items.commission_deferred` flag) — see next finding.
**Fix:** No-op if Option B is taken. If Option A is chosen later, a new migration + schema file are needed.

### M-3. `sales_order_items.commission_deferred` does not exist
**Plan ref:** §"Open Q-2" Option B; task 1.4.
**Reality:** `sales_order_items` has `commissionExcluded` (boolean, default false — line 27 of `sales-order-items.ts`) but **not** `commissionDeferred`. The plan's preferred path requires adding this column, but the §3 migration SQL does not include the `ADD COLUMN commission_deferred boolean` statement.
**Fix:** Add to the migration (and Drizzle schema):
```sql
ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS commission_deferred boolean NOT NULL DEFAULT false;
```
Also add `earnReason` column on `commission_splits` to the migration — Phase 1 task 1.2 mentions it but the §3 migration block omits it.

---

## LOW findings (style / docs)

### L-1. Index name `installments_sales_order_id_idx` and `package_instances_sales_order_id_idx` — no conflicts
**Plan ref:** §3 migration steps 2–3.
**Reality:** Grep of existing migrations + meta snapshots shows no existing index by either name. Safe to create.
**Note:** Existing convention in this repo is shorter names (`installments_status_idx`, `package_instances_status_idx`). For consistency consider `installments_sales_order_idx` / `package_instances_sales_order_idx` (drop the redundant `_id`). Cosmetic.

---

## INFO (verified — plan is correct)

### I-1. Tables cited all exist
- `commission_splits` — `commission-splits.ts` ✓
- `payouts` — `payouts.ts` ✓
- `package_instances` — `package-instances.ts` ✓
- `installments` — `installments.ts` ✓
- `sales_orders` / `sales_order_items` — `sales-orders.ts` / `sales-order-items.ts` ✓
- `members` — `members.ts` ✓
- `commission_coach_slots` — `commission-coach-slots.ts` ✓
- `package_instance_status_history` — `package-instance-status-history.ts` ✓ (created in migration 0031)

### I-2. `weightage_basis_points` column verified
Lives on `commission_coach_slots` (`commission-coach-slots.ts:11`) as `weightageBasisPoints: integer("weightage_basis_points").notNull()`. Trigger SQL in §3 migration step 5 references the correct column name.

### I-3. `installmentsPaid` / `installmentsTotal` / `expiresAt` exist on `package_instances`
- `installmentsTotal` (line 76)
- `installmentsPaid` (line 77)
- `expiresAt` (line 55)
All correctly named. The plan's `markCompleteIfFinal` predicate (`installmentsPaid === installmentsTotal && sessionsRemaining === 0`) is structurally sound — just substitute `creditsRemaining` (see M-1).

### I-4. `service.requiresBooking` does NOT exist
**Plan ref:** Phase 1 task 1.5 ("Distinguish via `service.requiresBooking` (already exists)").
**Reality:** Searched `packages/db/src/schema/tenant/services.ts` (read in full) — no `requiresBooking` / `requires_booking` field. The closest existing fields are:
- `schedulingType` ("appointment" | "class_slot")
- `type` ("private" | "semi_private" | "both")
- `sessionCount` (nullable; null could indicate non-bookable)
**Impact:** Plan task 1.5's gating condition won't compile. Either add the column, or substitute existing fields (e.g. "if `sessionCount IS NULL AND schedulingType != 'appointment'` then non-bookable retail").
**Severity escalation candidate:** This is arguably HIGH because the entire commission-deferral rule (Phase 1 §1.5) hinges on it. Listed under INFO because the plan asserts it "already exists" — once that assumption is corrected, the workaround is a 1-line schema add. **Author should re-classify with the user.**

---

## Recommended Migration Skeleton (corrected)

`packages/db/src/migrations/tenant/0051_sales_pipeline_fixes.sql`:

```sql
-- 1. (REMOVED) — package_instance_status is plain text, no enum to alter

-- 2. Link installments to sales_orders
ALTER TABLE installments
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id);
CREATE INDEX IF NOT EXISTS installments_sales_order_idx
  ON installments(sales_order_id);

-- 3. Link package_instances to sales_orders
ALTER TABLE package_instances
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id);
CREATE INDEX IF NOT EXISTS package_instances_sales_order_idx
  ON package_instances(sales_order_id);

-- 4. (NEW) frozen_until support — required by Phase 5 freeze procedure
ALTER TABLE package_instances
  ADD COLUMN IF NOT EXISTS frozen_until timestamptz;

-- 5. FK on assignedTrainerId (after pre-flight orphan cleanup)
DO $$ BEGIN
  ALTER TABLE package_instances
    ADD CONSTRAINT package_instances_assigned_trainer_fk
    FOREIGN KEY (assigned_trainer_id) REFERENCES members(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 6. (NEW) earn_reason column on commission_splits — Phase 1 task 1.2
ALTER TABLE commission_splits
  ADD COLUMN IF NOT EXISTS earn_reason text;
CREATE INDEX IF NOT EXISTS commission_splits_earn_reason_idx
  ON commission_splits(earn_reason);

-- 7. (NEW) commission_deferred flag on sales_order_items — Open Q-2 Option B
ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS commission_deferred boolean NOT NULL DEFAULT false;

-- 8. (NEW, optional) requires_booking on services — Phase 1 task 1.5
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS requires_booking boolean NOT NULL DEFAULT true;

-- 9. Coach-slot weightage CHECK trigger (kept as-is from §3)
CREATE OR REPLACE FUNCTION validate_coach_slot_weightages() … ;
DROP TRIGGER IF EXISTS commission_coach_slots_sum_check ON commission_coach_slots;
CREATE CONSTRAINT TRIGGER commission_coach_slots_sum_check … ;

-- 10. (REMOVED) — installment_payment_method is plain text, no enum to alter
```

After writing the SQL, run `bun gen:migrations` to update `packages/db/src/generated/tenant-migrations.generated.ts`, then `bun verify:migrations`.

---

## Required Plan Edits

1. **§3 migration block** — replace the two `ALTER TYPE` blocks with no-ops; add the four missing `ADD COLUMN` statements (`frozen_until`, `earn_reason`, `commission_deferred`, `requires_booking`).
2. **§3 status diagram** — note that `package_instances.status` is a free-text column; `frozen` and `completed` become valid by application convention (or via a new CHECK constraint), not by enum extension.
3. **Phase 5 §Files affected** — change `packages/db/src/schema/tenant/packages.ts` to `package-instances.ts` (the file that actually exists).
4. **Migration filename** — `0010_sales_pipeline_fixes.sql` → `0051_sales_pipeline_fixes.sql`.
5. **Phase 1 task 1.5** — verify whether `requires_booking` should be added or whether existing fields (`schedulingType`, `sessionCount`) are sufficient. Surface as an Open Question.
6. **API contract table** — `sessionsRemaining` → `creditsRemaining` (or document the mapping).
7. **Phase 5 task 5.1** — add pre-flight orphan cleanup for `assigned_trainer_id` before the FK add.
