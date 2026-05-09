# Tenant Migration Drift Audit

**Date:** 2026-05-01
**Auditor:** Backend Engineer
**Branch:** chore/merge-phase-5
**Scope:** Read-only. No DDL applied. No files modified.

---

## TL;DR

The inline `TENANT_MIGRATIONS` array in `migrate-tenant.ts` is the canonical production lineage — every live tenant DB uses it exclusively. The 5 on-disk SQL files that have no inline counterpart (`0004_talented_terrax`, `0011_clear_marvex`, `0012_military_captain_marvel`, `0013_dashing_venus`, `0014_lively_jane_foster`) have never been applied to any tenant and are dead code. **Strategy A** (treat inline array as truth, delete orphan on-disk files) is the correct path forward.

---

## Findings

### Live tenant state

Queried `SELECT hash FROM drizzle_migrations ORDER BY id` across all 7 known tenant databases.

| Tenant | Migration count | Notes |
|--------|----------------|-------|
| Direct `TENANT_DATABASE_URL` | 33 | Exact match with `TENANT_MIGRATIONS` array |
| Test Fitness Franchise | 37 | 33 inline + 4 pre-canonical extras (see Open Questions) |
| Test Org 1777516872351 | 32 | Missing `0018_ghl_per_branch_sync` only |
| Test Org 1777517296844 | 32 | Missing `0018_ghl_per_branch_sync` only |
| Test Org 1777518206046 | 32 | Missing `0018_ghl_per_branch_sync` only |
| Test Org 1777519025474 | 32 | Missing `0018_ghl_per_branch_sync` only |
| Test Org 1777520773265 | 32 | Missing `0018_ghl_per_branch_sync` only |

**Zero tenants** contain any of the 5 orphan on-disk hashes. The inline array is production truth.

The 6 Test Org tenants are each missing only `0018_ghl_per_branch_sync` — the most recent inline migration. This means the migration runner has not been invoked against those tenants since that migration was added. This is LOW risk: applying it is idempotent and additive.

### Schema equivalence

The two lineages are **NOT functionally equivalent**. Running the on-disk files against a fresh database would fail at `0011_clear_marvex.sql` because it tries to `CREATE TABLE installments`, `google_calendar_connections`, and 5 other tables that were already created by the inline lineage's earlier entries (`0005_schema_enhancement` through `0010`). The on-disk orphan files cannot be applied to any tenant that has already received the inline lineage.

Summary of tables in orphan on-disk files that collide with inline lineage:

| On-disk file | Collision tables (already exist via inline) |
|---|---|
| `0011_clear_marvex.sql` | installments, google_calendar_connections, google_calendar_event_mappings, installment_events, organization_settings, member_category_buffer_overrides, member_service_buffer_overrides |
| `0012_military_captain_marvel.sql` | installment_plans |
| `0013_dashing_venus.sql` | audit_logs, check_ins, member_sessions, refunds |
| `0014_lively_jane_foster.sql` | trainer_tiers, category_commission_configs, commission_coach_slots, commission_tier_rates, commission_conditions, commission_condition_rates |

`0004_talented_terrax.sql` creates an entirely different set of tables (member_profiles, service_members, customer_profiles, etc.) that were never part of the inline lineage and do not exist in any live tenant schema.

### Phantom-vs-real classification

**"Phantom"** = exists in inline array but has no matching on-disk file.
**"Orphan"** = exists on-disk but has no matching inline entry.

| Hash | On-disk | Inline array | Live DB | Classification |
|------|---------|-------------|---------|----------------|
| `0000_noisy_aqueduct` | yes | yes | yes | canonical |
| `0001_salty_morlocks` | yes | yes | yes | canonical |
| `0002_calm_martin_li` | yes | yes | yes | canonical |
| `0003_green_runaways` | yes | yes | yes | canonical |
| `0004_talented_terrax` | yes | no | no | orphan (dead code) |
| `0004_remove_soft_delete` | no | yes | yes | phantom (inline-only canonical) |
| `0005_schema_enhancement` | no | yes | yes | phantom (inline-only canonical) |
| `0005_confused_hitman` | yes | yes | yes | canonical |
| `0006_robust_titania` | yes | yes | yes | canonical |
| `0007_short_korath` | yes | yes | yes | canonical |
| `0008_schema_consolidation` | yes | yes | yes | canonical |
| `0009_bouncy_namorita` | yes | yes | yes | canonical |
| `0010_broad_ronan` | yes | yes | yes | canonical |
| `0011_clear_marvex` | yes | no | no | orphan (dead code) |
| `0011_installments` | no | yes | yes | phantom (inline-only canonical) |
| `0012_military_captain_marvel` | yes | no | no | orphan (dead code) |
| `0012_member_category_buffer` | no | yes | yes | phantom (inline-only canonical) |
| `0013_dashing_venus` | yes | no | no | orphan (dead code) |
| `0013_google_calendar` | no | yes | yes | phantom (inline-only canonical) |
| `0014_lively_jane_foster` | yes | no | no | orphan (dead code) |
| `0014_service_member_buffer` | no | yes | yes | phantom (inline-only canonical) |
| `0015_grace_period` through `0029_service_category_commission` | no | yes | yes | phantom (inline-only canonical) |
| `0015_abnormal_absorbing_man` | yes | yes | yes | canonical |
| `0016_worried_wolfpack` | yes | yes | yes | canonical |
| `0017_jazzy_hercules` | yes | yes | yes | canonical |
| `0018_ghl_per_branch_sync` | yes | yes | partial* | canonical (unapplied to 6 orgs) |

*Applied to `TENANT_DATABASE_URL` only; pending on 6 Test Org tenants.

**Note on user-reported count:** The task brief stated "9 on-disk files with no matching inline entry." The correct count is **5 orphan on-disk files**. The other 4 (`0015_abnormal_absorbing_man`, `0016_worried_wolfpack`, `0017_jazzy_hercules`, `0018_ghl_per_branch_sync`) match inline entries by hash name — the parity test is reporting false mismatches because it compares by array index position instead of hash-name string equality.

---

## Recommendation: Strategy A

The inline array is canonical. The orphan on-disk files are dead code. Clean up the on-disk lineage to match production reality.

### Steps

**Step 1 — Backfill `0018_ghl_per_branch_sync` to 6 Test Org tenants** (LOW risk)

Run the migration runner (via your existing `migrateToLatest` flow or equivalent) against each of the 6 Test Org tenants. This is purely additive; `isMigrationApplied()` ensures it won't double-apply. No DDL rollback needed.

**Step 2 — Delete 5 orphan on-disk SQL files** (MEDIUM risk — do in a separate PR)

Files to delete:
- `packages/db/src/migrations/tenant/0004_talented_terrax.sql`
- `packages/db/src/migrations/tenant/0011_clear_marvex.sql`
- `packages/db/src/migrations/tenant/0012_military_captain_marvel.sql`
- `packages/db/src/migrations/tenant/0013_dashing_venus.sql`
- `packages/db/src/migrations/tenant/0014_lively_jane_foster.sql`

Also remove their corresponding entries from `meta/_journal.json` and delete any `meta/0004_*.json`, `meta/0011_*.json`, `meta/0012_*.json`, `meta/0013_*.json`, `meta/0014_*.json` snapshot files.

**Step 3 — Fix the parity test** (LOW risk)

`migrate-tenant.test.ts` currently reports 9 mismatches. The 4 false positives are caused by comparing by array index rather than hash-name string match. Fix the test to use set-based comparison: `journalHashes.has(inlineMigration.hash)`. After fixing, the test should report exactly 0 mismatches (all canonical hashes present in both; orphan on-disk files removed in Step 2; phantom inline entries have no on-disk counterpart but that is intentional and the test should only check inline→journal direction).

### Risk

| Step | Risk | Rationale |
|------|------|-----------|
| Step 1 (backfill 0018) | LOW | Additive only; idempotent runner; affects dev/test tenants only |
| Step 2 (delete orphan files) | MEDIUM | Permanent deletion; drizzle-kit regeneration will no longer see these files; cannot roll back without git |
| Step 3 (fix parity test) | LOW | Test logic only; no production impact |

### Rollback

- Step 1: No rollback needed (additive migration). If GHL sync breaks, revert the migration via SQL (`DROP TABLE` for new GHL tables) — but this is dev-only data.
- Step 2: `git revert` restores files if needed. On-disk deletion has zero production impact since these files are not used by the runtime runner.
- Step 3: `git revert` the test change.

---

## Open questions

1. **Test Fitness Franchise ancient extras**: TFF has 4 hashes not in either lineage (`0002_rbac_tables`, `0003_add_branch_fields`, `0010_empty_marvel_boy`, `0018_famous_ego`). These predate the inline array. Are they from a manual migration era? Do they represent tables that still exist in TFF's schema? This should be verified before treating TFF as a production reference — though for this audit it does not affect the recommendation.

2. **On-disk lineage origin**: Were the 5 orphan files ever on a branch that was planned to replace the inline array? If so, there may be feature work (in `0004_talented_terrax` especially) that was never ported to the inline lineage. The tables it creates (member_profiles, customer_profiles, etc.) do not appear in any live tenant — this work is either abandoned or deferred.

3. **Drizzle-kit compatibility after cleanup**: After Step 2, verify that `drizzle-kit generate` produces consistent output. The journal must be contiguous after orphan entries are removed — renumbering the remaining entries may be required if the journal format enforces sequential `idx` values (it does: idx 0–18 currently; after removing 4, 11, 12, 13, 14 the remaining entries should be re-indexed 0–13).

4. **`0004_talented_terrax` feature status**: This file creates 15+ tables for features (member profiles, package instances, class slots, waitlist, recurrence rules, announcements, expenses) that appear abandoned. Confirm with product whether these features are truly dropped before deleting the SQL.
