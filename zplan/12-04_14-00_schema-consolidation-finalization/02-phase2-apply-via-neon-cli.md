# Phase 2: Apply the migration via Neon CLI

**Goal:** Take a Neon branch snapshot (rollback insurance), run pre-flight queries against the live dev tenant DB, apply `0010_schema_consolidation.sql` atomically via `psql`, verify the DB state, and register the migration in drizzle's `__drizzle_migrations` table so future `bun db:migrate` runs behave correctly.

**User journey this advances:** Sets up the consolidated DB state. Every downstream UI flow (Phase 5) depends on this.

**Dependencies:** Phase 1 complete. The SQL file exists and has been reviewed by at least one other pair of eyes.

---

## Prerequisites

Before starting Phase 2:

1. **Neon CLI installed.** Check:
   ```bash
   neon --version
   # If not installed: npm i -g neonctl  (or the current package name)
   ```

2. **Authenticated with Neon:**
   ```bash
   neon auth
   # Opens a browser for OAuth. One-time per machine.
   ```

3. **Project and branch identified.** From a dev workstation, you can list projects:
   ```bash
   neon projects list
   ```
   Record the relevant project ID and the main branch name. You'll reference these repeatedly.

4. **`psql` available.** Neon CLI does not execute SQL files directly — it gives you a connection string, and you pipe the SQL to `psql`. On Windows, install PostgreSQL tools or use WSL.

5. **The tenant DB connection string for the test org.**
   The dev setup uses a single "combined" database per `memory/MEMORY.md`, with `DATABASE_URL` pointing at the control panel DB. The tenant DB connection string is **not** stored in `.dev.vars` — it's encrypted in the `organizations.connection_string` column.

   For this migration we're hitting the **actual tenant Neon branch**, not the combined dev DB. Resolve the tenant connection string before starting:
   - Query `organizations` in the control panel DB with the test org ID (`996febce-aaad-4ded-8f47-02d2b566c8ee`)
   - Decrypt `connection_string` using `decrypt()` from `@avantej-core/db` (existing helper)
   - OR use Neon CLI to get it directly if the tenant is on a Neon branch you own:
     ```bash
     neon connection-string --project-id <tenant-project-id> --branch main
     ```

   Record the decrypted connection string as `$TENANT_DB_URL` in a shell variable for the rest of this phase. **Do not commit it anywhere.**

---

## Tasks

### Task 2.1 — Create a Neon branch snapshot (5 min)

**Why:** Free, instant point-in-time copy of the tenant DB. Rollback is `neon branches reset` or simply connecting to the backup branch. Superior to any JSON dump.

**How:**

```bash
# Create a snapshot branch of the current tenant main
neon branches create \
  --project-id <tenant-project-id> \
  --name schema-consolidation-backup-2026-04-12 \
  --parent main
```

Output includes a branch ID. Record both the name and ID in your scratch notes and paste them into the PR description at the end.

**Verify the backup is real:**

```bash
neon connection-string \
  --project-id <tenant-project-id> \
  --branch schema-consolidation-backup-2026-04-12
# Returns a connection string for the backup branch.

# Smoke query against the backup
psql "<backup_connection_string>" -c "SELECT COUNT(*) FROM packages;"
# Should return a number (or error if packages table doesn't exist, which would
# mean you're connected to the wrong DB)
```

**Rollback procedure (document in PR):**

```bash
# If things go wrong, you have two options:

# Option A: Reset main to the backup's state
neon branches reset --project-id <id> --branch main --to schema-consolidation-backup-2026-04-12

# Option B: Switch the tenant's connection_string in control_panel.organizations
# to point at the backup branch. Less surgical but preserves the main branch for investigation.
```

**Acceptance:** Backup branch exists, is accessible via psql, and queries return plausible row counts.

---

### Task 2.2 — Run the pre-flight check file (5 min)

**Why:** Before running the real migration, execute the read-only pre-flight queries. If any would abort the real migration, discover it now while nothing is at risk.

**How:**

```bash
psql "$TENANT_DB_URL" -f zplan/12-04_14-00_schema-consolidation-finalization/preflight-checks.sql | tee /tmp/preflight-output.txt
```

The file runs 9 checks. The first 5 are blockers; the last 4 are informational (informational checks never abort anything — they just tell you what the migration will do).

**Expected output for blockers (Checks 1–5):**
- Check 1 "Unmapped packages" — zero rows
- Check 2 "Ambiguous package→service matches" — zero rows
- Check 3 "Orphan package_instances" — zero rows
- Check 4 "Orphan cancelled_sales" — zero rows
- Check 5 "Duplicate cancellation_numbers" — zero rows

**Expected output for informational (Checks 6–9):**
- Check 6 — count of `appointment_clients` rows whose legacy pointer will be NULLed (all are mock data — OK)
- Check 7 — list of services whose `type` will be overwritten by the heuristic
- Check 8 — list of services whose `price` will be populated from the package
- Check 9 — baseline row counts (save this output, used for post-migration comparison in Task 2.5)

**If any blocker check returns non-empty:**
- Investigate the specific rows returned
- Either delete them (mock data — cleanest) or hand-fix them
- Re-run the pre-flight until all 5 blockers are clean

**Acceptance:**
- Checks 1–5 return empty result sets
- Check 9 output saved for post-migration comparison
- Informational output reviewed and nothing unexpected

---

### Task 2.3 — (absorbed into Task 2.2)

Baseline row counts are now produced by Check 9 of `preflight-checks.sql`. Save the Check 9 output from `/tmp/preflight-output.txt` — you'll compare against it in Task 2.5.

**Expected post-migration relationships:**
- `services` rows with `session_count IS NOT NULL` after ≈ `packages` count before
- `sales_orders WHERE status = 'cancelled' AND cancellation_number IS NOT NULL` count after ≈ `cancelled_sales` count before
- `package_instances` count unchanged
- `appointment_clients` count unchanged (but `package_instance_id` is now NULL on all rows that previously had `package_assignment_id` set — see Check 6)

---

### Task 2.4 — Apply the migration (5 min)

**Why:** This is the one-shot destructive step. Everything up to here has been reversible (or the backup covers it).

**How:**

```bash
# -1 wraps the whole file in a single transaction.
# -v ON_ERROR_STOP=1 aborts on the first error (without this, psql keeps going after errors).
# --echo-all prints each statement as it runs (helpful for reading the log).
psql "$TENANT_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -1 \
  --echo-all \
  -f packages/db/src/migrations/0010_schema_consolidation.sql \
  | tee /tmp/0010_migration_output.log
```

**Read the output carefully.** Look for:
- `BEGIN` at the start (confirms transaction open)
- `ALTER TABLE` / `UPDATE` / `DROP TABLE` statements each echo with their row counts
- `COMMIT` at the end (confirms success)
- No `ERROR` or `ROLLBACK` lines

**If the migration fails:**
- Read the error message — `psql` with `-1` automatically rolls back on error, so the DB is unchanged
- Fix the SQL file or the pre-flight state
- Re-run — should be a no-op on the unchanged DB

**Acceptance:** `COMMIT` appears at the end of the log, no errors.

---

### Task 2.5 — Verify post-migration state (20 min)

**How:**

```bash
# 5a. Legacy tables are gone
psql "$TENANT_DB_URL" -c "\dt" | grep -E "packages|package_assignments|cancelled_sales|service_rules|service_commission_config"
# Expected: no matches
```

```bash
# 5b. New columns exist on services, sales_orders, package_instances
psql "$TENANT_DB_URL" -c "\d services" | grep -E "session_count|expirable|expiry_days|expiry_date"
psql "$TENANT_DB_URL" -c "\d sales_orders" | grep -E "cancellation_|cancelled_amount"
psql "$TENANT_DB_URL" -c "\d package_instances" | grep -E "service_id"
psql "$TENANT_DB_URL" -c "\d package_instances" | grep -E "package_id"  # must be empty
```

```bash
# 5c. Services that were "packages" got session_count populated
psql "$TENANT_DB_URL" <<'SQL'
SELECT COUNT(*) AS consolidated_packages
FROM services WHERE session_count IS NOT NULL;
SQL
# Compare against the "packages" count from Task 2.3. Should be roughly equal
# (may be less if some packages were deduped, but shouldn't be more).
```

```bash
# 5d. Package instances all have service_id
psql "$TENANT_DB_URL" -c "SELECT COUNT(*) FROM package_instances WHERE service_id IS NULL;"
# Expected: 0
```

```bash
# 5e. Cancelled sales orders all have cancellation_number
psql "$TENANT_DB_URL" <<'SQL'
SELECT COUNT(*) AS cancelled_with_number
FROM sales_orders
WHERE status = 'cancelled' AND cancellation_number IS NOT NULL;
SQL
# Compare against "cancelled_sales" count from Task 2.3.
```

```bash
# 5f. Unique constraint on cancellation_number is enforced
psql "$TENANT_DB_URL" -c "\d sales_orders" | grep cancellation_number_unique
# Expected: one match
```

```bash
# 5g. FK constraint on package_instances.service_id is enforced
psql "$TENANT_DB_URL" -c "\d package_instances" | grep service_id_services_id_fk
# Expected: one match
```

```bash
# 5h. appointment_clients column was renamed and new FK exists
psql "$TENANT_DB_URL" -c "\d appointment_clients" | grep -E "package_instance_id|package_assignment_id"
# Expected: package_instance_id row present, package_assignment_id NOT present

psql "$TENANT_DB_URL" -c "\d appointment_clients" | grep appointment_clients_package_instance_id_fk
# Expected: one match (the new FK to package_instances)

# All rows should have NULL package_instance_id at this point (per Section 5.5 UPDATE)
psql "$TENANT_DB_URL" -c "SELECT COUNT(*) FROM appointment_clients WHERE package_instance_id IS NOT NULL;"
# Expected: 0
```

**Acceptance:** All 7 verification checks pass.

---

### Task 2.6 — Register migration in `__drizzle_migrations` (10 min)

**Why:** Drizzle's migrator tracks applied migrations in a table called `__drizzle_migrations` (or sometimes `drizzle.__drizzle_migrations` depending on the config). If this table doesn't know about 0010, the next time anyone runs `bun db:migrate`, drizzle will try to re-apply it — which will fail because the tables are already gone.

**How:**

First, check the current state of the migrations table:

```bash
psql "$TENANT_DB_URL" -c "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5;"
# If you see 0009 as the latest, proceed. If you see no table, drizzle hasn't been used with
# the migrator against this DB yet — skip this task.
```

The schema of `__drizzle_migrations` is typically:

```sql
CREATE TABLE __drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
```

`hash` is a SHA-256 of the SQL file content. Drizzle-kit computes this when it generates a migration. To compute it for a hand-written file:

```bash
# From repo root
sha256sum packages/db/src/migrations/0010_schema_consolidation.sql
# Output: <hash>  packages/db/src/migrations/0010_schema_consolidation.sql
```

Record the hash. Insert into the tracking table:

```bash
HASH=$(sha256sum packages/db/src/migrations/0010_schema_consolidation.sql | cut -d' ' -f1)
NOW_MS=$(($(date +%s) * 1000))

psql "$TENANT_DB_URL" <<SQL
INSERT INTO __drizzle_migrations (hash, created_at)
VALUES ('$HASH', $NOW_MS);
SQL
```

**Verify:**

```bash
psql "$TENANT_DB_URL" -c "SELECT * FROM __drizzle_migrations ORDER BY id DESC LIMIT 1;"
# Last row should be the one you just inserted with the correct hash.
```

**Test that `bun db:generate` reports no changes:**

```bash
DATABASE_URL="$TENANT_DB_URL" bun db:generate
# Expected output: "No schema changes, nothing to migrate" or similar
```

If drizzle-kit generates a new 0011 file, something is wrong — either the source schema drifted from what the SQL file built, or `meta/_journal.json` (Task 1.6) is out of sync. Investigate before proceeding.

**Acceptance:**
- Row exists in `__drizzle_migrations` with the correct hash
- `bun db:generate` reports no pending changes
- If `bun db:generate` DOES generate a new file, delete it and diagnose the mismatch before continuing

---

### Task 2.7 — Live API smoke test (15 min)

**Why:** Phase 2 ends with a real end-to-end check: can the app server actually talk to the migrated DB?

**How:**

```bash
# Start the server with the tenant DB config
cd apps/server
bun dev:server
```

```bash
# In another shell, hit a tenant-scoped endpoint
curl -X POST http://localhost:3000/rpc/services/list \
  -H "Content-Type: application/json" \
  -H "Cookie: <better_auth_session_cookie>" \
  -d '{"json": {"organizationId": "996febce-aaad-4ded-8f47-02d2b566c8ee"}}'
```

Confirm the response is a 200 with a JSON array of services, and that each service object includes `sessionCount`, `expirable`, `expiryDays`, `expiryDate`, `type`.

Also try cancelled sales:

```bash
curl -X POST http://localhost:3000/rpc/cancelledSales/list \
  -H "Content-Type: application/json" \
  -H "Cookie: <cookie>" \
  -d '{"json": {"organizationId": "996febce-aaad-4ded-8f47-02d2b566c8ee"}}'
```

Should return a list, each item with `cancelledAmount` reflecting the actual refund amount (or `totalAmount` fallback for any rows that slipped the backfill).

**Acceptance:** Both endpoints return 200 with properly shaped data.

---

## Phase 2 exit checklist

- [ ] Neon backup branch created, name + ID recorded
- [ ] All 5 pre-flight checks passed
- [ ] Baseline row counts recorded
- [ ] Migration applied via `psql -1 -f` with `ON_ERROR_STOP=1`
- [ ] All 7 post-migration verification queries passed
- [ ] `__drizzle_migrations` row inserted with correct hash
- [ ] `bun db:generate` reports no pending changes
- [ ] Live `services.list` and `cancelledSales.list` endpoints return correct data
- [ ] Migration log saved to `/tmp/0010_migration_output.log` or equivalent for PR attachment
