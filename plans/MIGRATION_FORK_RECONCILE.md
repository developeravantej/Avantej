# Tenant-Migration Fork Reconcile

Status: **investigation complete, ready for a pipeline owner to execute.**
Scope: reconcile the two divergent tenant-migration lineages into ONE linear
canonical chain for `main`. Read-only investigation only — no files renumbered,
no bundle regenerated, nothing pushed.

`drizzle_migrations` tracks applied migrations by **HASH = filename only** (never
the SQL body). This is the load-bearing fact for every "re-runs / skips" claim
below: rename a file → the runner treats it as unapplied and re-runs it; the SQL
being idempotent is what makes that safe.

---

## (a) Current state of both lineages

### Common base
`main`, `migrate-neon-account`, and `origin/feat/merged-checkpoint` all agree
through **`0095_payment_proofs`** and then **`0096_ghl_pending_contacts`**.
`main`'s tenant tree ends at `0096_ghl_pending_contacts`; its bundle's last hash
is `0096_ghl_pending_contacts`. `git rev-list --left-right --count
origin/main...origin/checkpoint-6-22` = `0  13` → **main is a strict ancestor of
checkpoint-6-22** (checkpoint = main + 13 commits).

### Lineage A — "MINE" (WS1–WS7)
On branch `migrate-neon-account` (working tree) and applied on the **live prod
MOVE tenant**. Base = `main`.

| File | Applied on | In git? |
|---|---|---|
| `0096_ghl_pending_contacts.sql` | prod MOVE + main | ✅ committed (on `main`, commit `10253789`) |
| `0097_money_currency.sql` | prod MOVE | ✅ committed `39ce4b8b` |
| `0098_branch_company_tax_numbering.sql` | prod MOVE | ✅ committed `f1316b3c` |
| `0099_payroll_periods.sql` | prod MOVE | ✅ committed `9a9cf23c` |
| `0100_import_jobs.sql` | prod MOVE | ✅ committed `8ca41b4f` |

### Lineage B — "DEV/DEPLOYED"
On `origin/checkpoint-6-22` **only** (not on `main`, not on
`feat/merged-checkpoint`). Applied on test tenants "Plan F.3.5 Global Billing
Test" + "Test Fitness Franchise".

| File | Origin commit (checkpoint-6-22) | In git? |
|---|---|---|
| `0096_commission_track_sales_type.sql` | `4865074b` | ✅ committed |
| `0097_commission_incentives.sql` | `6e24e857` | ✅ committed |
| `0098_external_busy_blocks.sql` | `1074b342` | ✅ committed |
| `0099_ghl_pending_contacts.sql` | `9fd2bd50` (merge of main → renamed from main's 0096) | ✅ committed |
| `0100_billing_documents.sql` | — | ❌ **NOT IN GIT ANYWHERE** (see below) |

**How the fork happened:** checkpoint-6-22 branched from an earlier `main`, added
its own `0096–0098` (commission_track_sales_type / commission_incentives /
external_busy_blocks), then **merged `main` back in** (commit `9fd2bd50`) and, to
dodge the `0096` filename collision, **renamed main's `0096_ghl_pending_contacts`
→ `0099_ghl_pending_contacts`**. My lineage instead kept ghl at `0096` (matching
main) and appended WS work at `0097–0100`. The two lineages are otherwise
**orthogonal** — no shared table or column names — so they compose cleanly.

### Recoverability summary (per file)

| File | Recoverable? | Where |
|---|---|---|
| `0096_commission_track_sales_type` | ✅ | `origin/checkpoint-6-22` |
| `0097_commission_incentives` | ✅ | `origin/checkpoint-6-22` |
| `0098_external_busy_blocks` | ✅ | `origin/checkpoint-6-22` |
| `0099_ghl_pending_contacts` (dev) | ✅ (== my 0096, redundant) | `origin/checkpoint-6-22` |
| `0100_billing_documents` | ❌ **UNRECOVERABLE from git** | live test tenant DB only |

**`0100_billing_documents` — exhaustive proof of absence.** `-S "billing_documents"`
on `*.sql` → nothing; `-G "billing_document"` on any path → nothing;
`git cat-file --batch-all-objects --batch | grep -aic 'billing_document'` (every
object incl. dangling/unreachable) → **0** (control `external_busy_blocks` → 49);
not in any ref's bundle; not on disk in either worktree; not in reflog/stash.
The migration + its schema + its feature code were **never committed**. See
`recovered/README.md` for the out-of-band (live-DB introspection) recovery path.

---

## (b) `ghl_pending_contacts` overlap — VERDICT: **same migration, drop the dev copy**

`diff` of my `0096_ghl_pending_contacts.sql` (== main's) vs dev's
`0099_ghl_pending_contacts.sql`:

```
1c1
< -- 0096_ghl_pending_contacts (GHL inbound approval gate)
---
> -- 0099_ghl_pending_contacts (GHL inbound approval gate)
```

**Byte-identical except the header comment line.** They are literally the same
migration under two numbers (dev's is main's file renamed during the `9fd2bd50`
merge). Only **ONE** survives the reconcile: keep **`0096_ghl_pending_contacts`**
(already on `main` + prod). Dev's `0099_ghl_pending_contacts` is **dropped** — it
is not carried forward as a separate file. Test tenants that recorded it under
hash `0099_ghl_pending_contacts` will re-run the canonical `0096` copy once (its
`CREATE TABLE IF NOT EXISTS` no-ops against the already-present table). Safe.

---

## (c) Proposed canonical ordering

**Principle:** renumber the lineage applied on the fewest / lowest-stakes tenants.
My WS files are live on **prod**; dev files are live on **2 test tenants**. So
keep my `0096–0100` at their numbers (zero re-run churn on prod) and **append the
dev-lineage files renumbered onto the tail** as `0101–0103`. ghl is kept once at
`0096`; dev's redundant `0099_ghl_pending_contacts` is dropped; `billing_documents`
is omitted (unrecoverable).

| new # | source file | origin lineage | idempotent? | notes |
|---|---|---|---|---|
| 0096 | `0096_ghl_pending_contacts.sql` | shared (main + mine == dev's 0099) | ✅ `CREATE TABLE IF NOT EXISTS` + `DO $$…duplicate_object` | already on `main`; **keep as-is**; dev's `0099_ghl_pending_contacts` dropped as a duplicate |
| 0097 | `0097_money_currency.sql` | A (mine) | ✅ `ADD COLUMN IF NOT EXISTS` + NULL-guarded backfills | unchanged |
| 0098 | `0098_branch_company_tax_numbering.sql` | A (mine) | ✅ `ADD COLUMN/CREATE … IF NOT EXISTS` | unchanged |
| 0099 | `0099_payroll_periods.sql` | A (mine) | ✅ `CREATE TABLE/INDEX IF NOT EXISTS` | unchanged |
| 0100 | `0100_import_jobs.sql` | A (mine) | ✅ `CREATE TABLE/INDEX IF NOT EXISTS` | unchanged |
| 0101 | `0096_commission_track_sales_type.sql` → **`0101_commission_track_sales_type.sql`** | B (dev) | ✅ `ADD COLUMN IF NOT EXISTS commission_tracks.sales_type` | renumber; bump header comment to `0101` |
| 0102 | `0097_commission_incentives.sql` → **`0102_commission_incentives.sql`** | B (dev) | ✅ `CREATE TABLE IF NOT EXISTS` + `DO $$…duplicate_object` FK | renumber; FK → `trainer_tiers` (pre-exists) |
| 0103 | `0098_external_busy_blocks.sql` → **`0103_external_busy_blocks.sql`** | B (dev) | ✅ `CREATE TABLE IF NOT EXISTS` + `DO $$…duplicate_object` FKs | renumber; FKs → `google_calendar_connections`, `members` (pre-exist) |
| — | `0100_billing_documents.sql` | B (dev) | n/a | **OMITTED — unrecoverable.** Reconstruct later from a live test tenant if the feature is resurrected (see RISK). |

**Fresh-tenant ordering is safe:** every table an FK references
(`trainer_tiers`, `google_calendar_connections`, `members`, `commission_tracks`)
is created by an earlier migration (≤ 0095), so the appended `0101–0103` resolve
cleanly regardless of the two lineages' relative order.

### What each existing tenant does under this chain (all idempotent)
- **Prod MOVE (lineage A):** `0096–0100` hashes already applied → **skipped**.
  `0101/0102/0103` are new → runs them → gains `commission_tracks.sales_type`,
  `commission_incentives(+awards)`, `external_busy_blocks`. ✅
- **Test tenants (lineage B):** their applied hashes were
  `0096_commission_track_sales_type / 0097_commission_incentives /
  0098_external_busy_blocks / 0099_ghl_pending_contacts / 0100_billing_documents`.
  Under canonical, filenames `0096_ghl_pending_contacts` + `0097–0100` (mine) +
  `0101–0103` (dev, renamed) are all **new hashes** → all re-run. The dev tables
  already exist → their re-created `IF NOT EXISTS` bodies no-op; my WS tables are
  genuinely new → created. Net: test tenants **gain the WS schema they were
  missing**; old hash rows (incl. `0100_billing_documents`) remain as harmless
  orphan rows; the orphan `billing_documents` **table** persists (pre-existing
  drift, unchanged by this reconcile). ✅

---

## (d) Exact steps for the pipeline owner

Assumes lineage A (`migrate-neon-account`) is landed on `main` first (it carries
`0096_ghl_pending_contacts` + WS `0097–0100`). Then graft the 3 dev files:

```bash
cd /Users/ngchwanlii/App/prod/avantej-core      # or the worktree of choice
git switch main && git pull                       # main now has 0096_ghl + 0097-0100 (mine)
DIR=packages/db/src/migrations/tenant

# 1. Pull the 3 recoverable dev-lineage files off checkpoint-6-22, RENUMBERED.
git show origin/checkpoint-6-22:$DIR/0096_commission_track_sales_type.sql > $DIR/0101_commission_track_sales_type.sql
git show origin/checkpoint-6-22:$DIR/0097_commission_incentives.sql       > $DIR/0102_commission_incentives.sql
git show origin/checkpoint-6-22:$DIR/0098_external_busy_blocks.sql         > $DIR/0103_external_busy_blocks.sql
# (Do NOT bring 0099_ghl_pending_contacts — duplicate of 0096. Do NOT bring 0100_billing_documents — unrecoverable.)

# 2. Bump the header comment number inside each renumbered file (cosmetic; hash = filename).
#    e.g. sed -i '' '1s/0096_commission_track_sales_type/0101_commission_track_sales_type/' $DIR/0101_commission_track_sales_type.sql
#         sed -i '' '1s/0097_commission_incentives/0102_commission_incentives/'          $DIR/0102_commission_incentives.sql
#         sed -i '' '1s/0098_external_busy_blocks/0103_external_busy_blocks/'            $DIR/0103_external_busy_blocks.sql

# 3. Regenerate the bundle from the SQL files and verify parity.
bun gen:migrations
bun verify:migrations            # must pass — confirms generated.ts == on-disk SQL

# 4. Schema-drift gates (0102/0103 add FKs → regenerate the ERD baseline).
bun scripts/gen-erd.ts
bun scripts/check-drift.ts       # expect it to want the new commission_incentives / external_busy_blocks FKs baselined

# 5. Commit BOTH the SQL files and the regenerated bundle together.
git add $DIR/0101_*.sql $DIR/0102_*.sql $DIR/0103_*.sql \
        packages/db/src/generated/tenant-migrations.generated.ts \
        zhub/shared/schema-*.md zhub/shared/*drift*.json
git commit -m "chore(db): reconcile tenant-migration fork — graft dev lineage (commission sales_type / incentives / external_busy_blocks) as 0101-0103"

# 6. Roll out to existing tenants (idempotent for all; see section (c)).
#    bun apps/server/scripts/migrate-all-tenants.ts   # per docs/TENANT_MIGRATION_WORKFLOW.md
```

Post-landing, `main`'s canonical tail is: `…0095 → 0096_ghl_pending_contacts →
0097_money_currency → 0098_branch_company_tax_numbering → 0099_payroll_periods →
0100_import_jobs → 0101_commission_track_sales_type → 0102_commission_incentives
→ 0103_external_busy_blocks`.

---

## (e) RISK

**Hard fact:** `0100_billing_documents` SQL is **unrecoverable from git**. It is
NOT, however, a hard blocker for *this reconcile*, because **no committed code
references `billing_documents`** (object-wide grep = 0) — there is nothing on
`main` or either lineage that would 500 without the table. Landing the canonical
chain above without it leaves `main` internally consistent.

`billing_documents` only becomes a blocker for a *separate* effort:
- **Feature resurrection:** if anyone re-introduces billing-document code, its
  migration must be **reconstructed from a live test tenant** (introspect
  `billing_documents` on "Plan F.3.5 Global Billing Test" / "Test Fitness
  Franchise" via Neon; see `recovered/README.md`). Git cannot supply it.
- **New-tenant parity vs test tenants:** new tenants provisioned from canonical
  `main` will **not** have a `billing_documents` table, while the 2 test tenants
  do (orphan drift). Harmless until code depends on it.

**What breaks if `main` is reconciled by naively merging checkpoint-6-22 WITHOUT
this plan:**
- **Filename collision at 0096–0100:** both lineages define different
  `0096/0097/0098/…0100_*` files. A blind merge yields two files per number (or a
  clobber), and `bun verify:migrations` / the runner break.
- **Duplicate ghl migration:** both `0096_ghl_pending_contacts` and
  `0099_ghl_pending_contacts` would ship — same table, two hashes — re-running
  needlessly and muddying the applied-set (this plan drops the dupe).
- **Missing dev tables on new tenants:** if only lineage A lands (today's
  `migrate-neon-account`), new tenants get **no** `commission_incentives`,
  `commission_incentive_awards`, `external_busy_blocks`, and no
  `commission_tracks.sales_type` — the WS-parity dev features silently break on
  every newly provisioned tenant. The renumbered `0101–0103` above fix exactly
  this.

**Out-of-scope dependency (flag, not a migration task):** the `0101–0103` tables
are *used* by the **13 feature commits on `checkpoint-6-22`** (commission
incentive sweep, renewal-vs-new-sale scoping, Google-Calendar pull-sync). Landing
the migrations alone creates empty, unused tables. A complete reconcile also
merges that feature code — track separately; the migration graft here is
necessary-but-not-sufficient for those features.

---

## Appendix — provenance / commands run (all read-only)

- `git worktree list`, `git branch -a`, `git tag`
- `git log --all --source -- <file>` for each dev-lineage file
- `git ls-tree -r --name-only <ref> -- packages/db/src/migrations/tenant/` for
  `origin/main`, `origin/checkpoint-6-22`, `origin/feat/merged-checkpoint`
- `git show <ref>:…/generated/tenant-migrations.generated.ts | grep hash:` (bundle tails)
- `git cat-file --batch-all-objects --batch | grep -aic 'billing_document'` → 0
  (control `external_busy_blocks` → 49)
- `diff` of the two `ghl_pending_contacts` blobs
- `find <both worktrees> -iname '*billing_document*'` → nothing
- `git reflog --all`, `git stash list`, `git fsck --lost-found --dangling`
