# Tenant Migration Reconciliation Inventory

Generated: 2026-05-06T08:01:23.639Z

- Embedded entries: 34
- File entries: 23
- Overlap: 15
- Embedded only: 19
- File only: 8

## Overlap (15)

hash | raw | normalized | emb-sha | file-sha
-----|-----|------------|---------|---------
0000_noisy_aqueduct | DIFFER | MATCH | 9d70014073b6 | fd01e7c7c032
0001_salty_morlocks | DIFFER | MATCH | fb9b92738fe1 | 34023920718c
0002_calm_martin_li | DIFFER | MATCH | e419051a1443 | dc406ae5888b
0003_green_runaways | DIFFER | MATCH | edf735d0085e | a9c30b379d1e
0005_confused_hitman | DIFFER | MATCH | c97139893be1 | 662721b51bd1
0006_robust_titania | DIFFER | MATCH | b2168d019389 | a8c054e39f4b
0007_short_korath | DIFFER | MATCH | a3a436d6fef5 | 6adaacf66fd8
0008_schema_consolidation | DIFFER | DIFFER | 6d1217900016 | 4075496d2e3f
0009_bouncy_namorita | DIFFER | DIFFER | 0f6b47d0c1f1 | bece29d58af9
0010_broad_ronan | DIFFER | MATCH | 5b81c4cefbb9 | a14976726ddd
0015_abnormal_absorbing_man | DIFFER | MATCH | 71bad6fcff76 | 2ceb4a930392
0016_worried_wolfpack | DIFFER | DIFFER | 7d8b8eab71f8 | 558a36fce7a1
0017_jazzy_hercules | DIFFER | MATCH | 1165e135fb43 | 67e5c47bacb6
0018_famous_ego | DIFFER | MATCH | 4621ffb7664a | bee45b367799
0021_add_tenant_migrations_metadata | DIFFER | DIFFER | 0e521b544828 | d4b8f95b61b8

## Embedded only (19)

- 0004_remove_soft_delete
- 0005_schema_enhancement
- 0011_installments
- 0012_member_category_buffer
- 0013_google_calendar
- 0014_service_member_buffer
- 0015_grace_period
- 0016_credits_generated
- 0017_installment_plans
- 0018_installment_plan_premium
- 0019_audit_logs
- 0022_check_ins
- 0023_refunds
- 0024_commission_splits_status
- 0025_member_sessions
- 0026_pipeline_audit
- 0027_walkin_commission
- 0028_checkin_display_name
- 0029_service_category_commission

## File only (8)

- 0004_talented_terrax
- 0011_clear_marvex
- 0012_military_captain_marvel
- 0013_dashing_venus
- 0014_expenses_currency_myr
- 0014_lively_jane_foster
- 0019_gray_rachel_grey
- 0020_add_coach_intake_tables

## STOP: 4 overlaps differ even after whitespace normalization

Per Task 2 stop condition. Each delta below was inspected statement-by-statement.
Full side-by-side SQL is in `reconcile-overlap-diffs.md`.

### `0008_schema_consolidation` — cosmetic only
- File adds section banner comments (`-- SECTION 1: ...`) and blank lines between
  statement groups; embedded has no comments.
- Identical statement set, identical statement order, identical SQL bodies.
- **Verdict:** semantically equivalent. File is the more readable form.

### `0009_bouncy_namorita` — idempotency-guard delta
- File: `CREATE TABLE "dashboard_snapshots"` / `CREATE TABLE "trainer_availability"` (no `IF NOT EXISTS`).
- Embedded: same two `CREATE TABLE IF NOT EXISTS`.
- File: `ALTER TABLE "partner_stripe_accounts" DROP CONSTRAINT "..."` (no `IF EXISTS`).
- Embedded: `DROP CONSTRAINT IF EXISTS`.
- File: 4× `CREATE INDEX "..."` (no `IF NOT EXISTS`).
- Embedded: 4× `CREATE INDEX IF NOT EXISTS`.
- One identical `ALTER TABLE ... ADD CONSTRAINT trainer_availability_trainer_id_members_id_fk`.
- **Verdict:** same statement set, identical effect on a fresh tenant. Embedded is safer
  on partial re-run; file is the form drizzle-kit emits. Either is acceptable since
  the migration runner skips by hash, not by SQL re-execution.

### `0016_worried_wolfpack` — statement-breakpoint delta
- File: two `ALTER TABLE` statements separated by `--> statement-breakpoint`.
- Embedded: same two statements concatenated with no breakpoint (so the parser
  treats them as a single statement chunk; the embedded path apparently relies on
  the underlying client accepting multi-statement strings).
- **Verdict:** same 2 statements, same effect. File is the safer/correct form per
  the rest of the codebase's breakpoint convention.

### `0021_add_tenant_migrations_metadata` — cosmetic only
- File adds 3 lines of leading comments + a `--> statement-breakpoint` between
  the two `ALTER TABLE`s; embedded has neither.
- Identical 2 `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements.
- **Verdict:** semantically equivalent.

## Recommendation

**Adopt file content as canonical for all 4 overlapping divergent hashes.** Justification:

1. All 4 are semantically equivalent or strictly safer in the file form.
2. Existing tenants are tracked in `drizzle_migrations` by hash; the runner skips
   already-applied hashes regardless of current SQL content. Re-run risk is zero
   for already-provisioned tenants.
3. Fresh tenant provisions would get the file content as the authoritative SQL —
   which is what the rest of this initiative is moving toward (files = source of truth).
4. The `0009` idempotency-guard regression on file-form is moot because no tenant
   ever re-runs an applied hash.

If user disagrees on any specific hash, override per-hash before re-running.

## Notes

- Filename collision risk: file-only and embedded-only share number prefixes (0004, 0011, 0012, 0013, 0014, 0019). They are DIFFERENT migrations sharing prefix only — both coexist as separate `.sql` files keyed by full hash.
- Node-side `loadMigrationFiles()` (`apps/server/src/lib/tenant-migrate.ts`) sorts alphabetically by full filename. After this reconciliation, fresh-provision Node order will be: `0004_remove_soft_delete` before `0004_talented_terrax`, `0005_confused_hitman` before `0005_schema_enhancement`, `0011_clear_marvex` before `0011_installments`, etc. Workers-embedded historical order is preserved separately by the generated module's array order. Production path is Workers, so this divergence is acceptable but documented.