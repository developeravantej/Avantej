# Schema Drift Audit — Post-Apply Re-Run
**Session:** zplan/05-06_09-12_schema-relationship-fixes
**Run:** 2nd pass (after --apply amendments)
**Findings:** 3 (C 1 · H 1 · M 1)

---

## Findings

### [CRITICAL] Individual agent migration filenames still reference old (taken) numbers
**Plan claims:** Phase 1 header now contains renumber warning (applied by AF8). Agent sections still list:
- Agent 1.1 owner-files: `0009_fix_walk_in_customer_actions.sql`
- Agent 2.9 owner-files: `0019_add_commission_reversals.sql`
- Agent 3.1 owner-files: `0020_add_memberships_table.sql`
- Other agent sections: `0010`, `0011`, `0012`, `0013`, etc. throughout Phase 2

**Actual:**
- `0009` = `0009_majestic_switch.sql` (dashboard_snapshots) — **taken**
- `0019` = `0019_gray_rachel_grey.sql` (preferred_trainer_id FK) — **taken**
- `0020` = `0020_coach_intake_tables.sql` — **taken**
- Next available: **0021+**

**File:** Plan §5 Agent 1.1, 2.1–2.10, 3.1–3.6 owner-files sections — every agent that cites a `00XX_` filename
**Fix:** Assign sequential numbers 0021+ to every new migration. Suggested mapping:
- 1.1 → `0021_fix_walk_in_customer_actions.sql`
- 1.3 → `0022_fix_ghl_branch_links_rename.sql`
- 2.1 → `0023_add_roles_permissions.sql`
- 2.2 → `0024_add_service_branch_prices.sql`
- 2.3 → `0025_add_sales_order_item_tax.sql`
- 2.4 → `0026_add_appointment_exclude_constraint.sql`
- 2.5 → `0027_add_commission_config_versioning.sql`
- 2.6 → `0028_add_stock_movements.sql`
- 2.7 → `0029_add_status_history_tables.sql`
- 2.8 → `0030_add_refund_items.sql`
- 2.9 → `0031_add_commission_split_reversals.sql`
- 2.10 → `0032_verify_payment_items_fk.sql` (validation only — col already exists)
- 3.1 → `0033_add_memberships.sql`
- etc.

---

### [HIGH] preferred_trainer_id FK already added without NOT VALID guard (migration 0019)
**Plan claims:** Task 1.2 adds FK with `NOT VALID` + later `VALIDATE` pattern (non-blocking on existing rows)
**Actual:** Migration 0019 added FK synchronously (no `NOT VALID`). Task 1.2 is now a validation-only task per AF6 annotation. However, the constraint name `package_instances_preferred_trainer_id_members_id_fk` must be verified live — if orphan rows existed at migration time, the constraint may be in a failed state.
**File:** `packages/db/src/migrations/tenant/0019_gray_rachel_grey.sql:2`
**Fix:** Agent 1.2 scoped to validation only. Query before Phase 1 dispatch:
```sql
SELECT conname, convalidated FROM pg_constraint
WHERE conname = 'package_instances_preferred_trainer_id_members_id_fk';
```
If `convalidated = false`, constraint add silently failed — blocker.

---

### [MEDIUM] Agent 2.10 scope not fully corrected in owner-files section
**Plan claims:** AF7 annotation marks 2.10 as "verify FK enforcement only — column already exists"
**Actual:** AF7 annotation added inline above Agent 2.10 section but owner-files list still includes `packages/db/src/schema/tenant/payment-items.ts` as "(modify)" rather than "(read-only verify)". The `promotionId` column (line 25) and index (line 37) in `payment-items.ts` already exist from Phase 2S.
**File:** Plan §5 Agent 2.10 owner-files
**Fix:** Change Agent 2.10 owner-files entry from "(modify)" to "(verify only — col + index already present)". No migration file needed for Agent 2.10 — remove migration filename from owner-files.

---

## Summary

The Phase 1 header renumber warning (AF8) was applied successfully, but none of the individual agent owner-files sections had their migration filenames updated. Every agent that references a `00XX_` filename in owner-files must have that number updated to 0021+ before dispatch — otherwise agents will try to create migration files at already-taken slots, causing `migrate-tenant.ts` to reject them. Two other findings are lower-severity: the preferred_trainer_id FK needs validation (not re-addition), and Agent 2.10 scope description is inconsistent with the AF7 annotation. **No new schema drift findings** — the underlying schema design remains sound; only the migration filename coordinates need updating.
