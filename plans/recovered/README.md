# Recovered tenant-migration SQL

## `0100_billing_documents.sql` — NOT RECOVERED (not present in git anywhere)

An exhaustive object-level sweep of the entire repository could not locate this
file or any fragment of its SQL:

- `git log --all -S "billing_documents" -- '*.sql'` → **no commits**
- `git log --all -G "billing_document"` (any path) → **no commits**
- `git cat-file --batch-all-objects --batch | grep -aic 'billing_document'`
  (scans **every** object — blobs, trees, commits, including dangling/unreachable)
  → **0** (control string `external_busy_blocks` → 49, proving the scan works)
- Not in the generated bundle on any ref
  (`origin/checkpoint-6-22` bundle ends at `0099_ghl_pending_contacts`)
- Not on disk in either worktree
  (`/Users/ngchwanlii/App/prod/avantej-core`, this worktree) —
  `find ... -iname '*billing_document*'` → nothing
- Not in `git reflog --all` / `git stash list`

**Conclusion:** the migration, its Drizzle schema, and its feature code were
**never committed to git**. The DDL exists only as applied statements on the
live test tenants ("Plan F.3.5 Global Billing Test", "Test Fitness Franchise").

### Only recovery path (out-of-band, NOT via git)
Introspect a live test tenant that has the table and reconstruct the SQL
idempotently. E.g. via Neon MCP / psql against that tenant branch:

```sql
-- shape
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'billing_documents' ORDER BY ordinal_position;
-- indexes + constraints
SELECT indexdef FROM pg_indexes WHERE tablename = 'billing_documents';
```

Then hand-write `packages/db/src/migrations/tenant/NNNN_billing_documents.sql`
using `CREATE TABLE IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN duplicate_object`.
This is a **feature-recovery** task, not part of the migration-fork reconcile —
see `../MIGRATION_FORK_RECONCILE.md` §RISK.
