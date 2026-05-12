/**
 * Multi-Tenant Database Migration Script
 *
 * Applies schema changes to all tenant databases by reading organization
 * connection strings from the control panel database.
 *
 * Usage:
 *   bun run migrate-all-tenants.ts [migration-name]
 *   bun run migrate-all-tenants.ts --list
 *   bun run migrate-all-tenants.ts --dry-run add-unique-branch-names
 *
 * Example:
 *   bun run migrate-all-tenants.ts add-unique-branch-names
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { decrypt } from "../lib/encryption";
import "dotenv/config";

// Configure WebSocket support for Neon
neonConfig.webSocketConstructor = ws;

// Migration definitions
const MIGRATIONS: Record<string, { name: string; sql: string }> = {
  "add-unique-branch-names": {
    name: "Add unique constraint for branch names",
    sql: `CREATE UNIQUE INDEX "hierarchy_nodes_branch_name_unique" ON "hierarchy_nodes"("name") WHERE "type" = 'branch';`,
  },
  "ghl-per-branch-sync": {
    name: "Add GHL per-branch sync columns + ghl_user_links table (idempotent, nullable-first)",
    sql: `CREATE TABLE IF NOT EXISTS "ghl_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"member_id" uuid NOT NULL,
	"branch_node_id" uuid NOT NULL,
	"ghl_location_id" text NOT NULL,
	"last_error" text,
	"sync_status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_contact_links_sync_status_idx";--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN IF NOT EXISTS "branch_node_id" uuid;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN IF NOT EXISTS "ghl_location_id" text;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_user_links_ghl_user_id_unique" ON "ghl_user_links" USING btree ("ghl_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_user_links_member_branch_unique" ON "ghl_user_links" USING btree ("member_id","branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_user_idx" ON "ghl_user_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_member_idx" ON "ghl_user_links" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_branch_idx" ON "ghl_user_links" USING btree ("branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_ghl_location_idx" ON "ghl_user_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_sync_status_idx" ON "ghl_user_links" USING btree ("sync_status","last_synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_contact_links_customer_branch_unique" ON "ghl_contact_links" USING btree ("customer_profile_id","branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_contact_links_branch_idx" ON "ghl_contact_links" USING btree ("branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_contact_links_ghl_location_idx" ON "ghl_contact_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_contact_links_sync_status_idx" ON "ghl_contact_links" USING btree ("sync_status","last_synced_at");`,
  },
  "add-members-deleted-at": {
    name: "Add deleted_at column for staff member soft-delete",
    sql: `ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_deleted_at_idx" ON "members" ("deleted_at");`,
  },
  "hierarchy-rename-region-state": {
    name: "Phase H1: rename hierarchy 'region' → 'state', shift branch depth 4 → 3 (requires zero 'area' rows)",
    sql: `DO $$
DECLARE area_count int;
BEGIN
  SELECT count(*) INTO area_count FROM hierarchy_nodes WHERE type = 'area';
  IF area_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % area row(s) exist. Run flatten-areas.ts first.', area_count;
  END IF;
END $$;
--> statement-breakpoint
UPDATE hierarchy_nodes SET type = 'state', updated_at = now() WHERE type = 'region';
--> statement-breakpoint
UPDATE hierarchy_nodes SET depth = 3, updated_at = now() WHERE type = 'branch' AND depth = 4;`,
  },
  "hierarchy-country-fk-archived-at": {
    name: "Phase G0: add country_node_id denorm FK + archived_at soft archive on hierarchy_nodes",
    sql: `ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "country_node_id" uuid REFERENCES "hierarchy_nodes"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_country_idx" ON "hierarchy_nodes" ("country_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_archived_at_idx" ON "hierarchy_nodes" ("archived_at");
--> statement-breakpoint
WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, type, id AS country_id FROM hierarchy_nodes WHERE type = 'country'
  UNION ALL
  SELECT h.id, h.parent_id, h.type, a.country_id
  FROM hierarchy_nodes h JOIN ancestors a ON h.parent_id = a.id
)
UPDATE hierarchy_nodes h SET country_node_id = a.country_id, updated_at = now()
FROM ancestors a
WHERE h.id = a.id AND h.type IN ('state', 'branch') AND h.country_node_id IS NULL;`,
  },
  "ghl-links-single-entity-unique": {
    name: "Phase G: flip ghl_contact_links + ghl_user_links unique from (entity, branch) → (entity)",
    sql: `-- Phase G: flip ghl_contact_links and ghl_user_links unique constraints from
-- (entity, branch) → (entity). Reflects org-shared GHL model: one customer
-- maps to ONE GHL contact per org; one member maps to ONE GHL user per org.

-- Pre-flight: detect duplicate (customer_profile_id) rows that would block the
-- new unique. If any tenant has >1 row per customer, hard-fail with a clear
-- message so the operator can dedupe before retrying.
DO $$
DECLARE
  dup_count int;
  offending_ids text;
BEGIN
  SELECT count(*), string_agg(customer_profile_id::text, ', ')
    INTO dup_count, offending_ids
  FROM (
    SELECT customer_profile_id FROM ghl_contact_links
    GROUP BY customer_profile_id HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % customer_profile_id(s) in ghl_contact_links have multiple rows. Offending: %. Dedupe before applying.', dup_count, offending_ids;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  dup_count int;
  offending_ids text;
BEGIN
  SELECT count(*), string_agg(member_id::text, ', ')
    INTO dup_count, offending_ids
  FROM (
    SELECT member_id FROM ghl_user_links
    GROUP BY member_id HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % member_id(s) in ghl_user_links have multiple rows. Offending: %. Dedupe before applying.', dup_count, offending_ids;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_contact_links_customer_branch_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_user_links_member_branch_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_contact_links_customer_unique" ON "ghl_contact_links" ("customer_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_user_links_member_unique" ON "ghl_user_links" ("member_id");`,
  },
  "hierarchy-name-uniqueness": {
    name: "Phase H-hygiene: partial unique on country names + (parent, state name) — blocks if dupes exist",
    sql: `-- Phase H-hygiene: prevent duplicate sibling rows by enforcing uniqueness
-- on the (parent_id, name) key per type. App layer already validates this
-- on insert (hierarchy_validation.service.ts), but the DB-level constraint
-- catches programmatic inserts that bypass the service.
-- Note: existing branch-name partial unique covers the leaf level globally.

-- 1. Pre-flight dedup checks (hard-fail with actionable message).
-- The orchestrator will run merge-duplicate-siblings.ts on affected tenants
-- before applying this migration. CREATE UNIQUE INDEX would itself error if
-- duplicates exist, but the explicit checks give a clearer remediation hint.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT name FROM hierarchy_nodes
    WHERE type = 'country' AND archived_at IS NULL
    GROUP BY name HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % duplicate country name(s) exist. Run merge-duplicate-siblings.ts first.', dup_count;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT parent_id, name FROM hierarchy_nodes
    WHERE type = 'state' AND archived_at IS NULL
    GROUP BY parent_id, name HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % duplicate state sibling(s) exist. Run merge-duplicate-siblings.ts first.', dup_count;
  END IF;
END $$;
--> statement-breakpoint
-- 2. Create the partial uniques (idempotent via IF NOT EXISTS).
-- Country names must be globally unique within an org (one tenant DB =
-- one org). No parent_id matching needed since the org root is the
-- only parent type=country can have.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_country_name_unique"
  ON "hierarchy_nodes" ("name")
  WHERE "type" = 'country' AND "archived_at" IS NULL;
--> statement-breakpoint
-- State names unique within their parent country.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_state_sibling_name_unique"
  ON "hierarchy_nodes" ("parent_id", "name")
  WHERE "type" = 'state' AND "archived_at" IS NULL;`,
  },
  "hierarchy-type-enum": {
    name: "Phase H2: convert hierarchy_nodes.type text → Postgres enum (drop+recreate partial indexes referencing type)",
    sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hierarchy_node_type') THEN
    CREATE TYPE hierarchy_node_type AS ENUM ('organization', 'country', 'state', 'branch');
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE bad_count int; bad_types text;
BEGIN
  SELECT count(DISTINCT type), string_agg(DISTINCT type, ', ')
    INTO bad_count, bad_types
  FROM hierarchy_nodes
  WHERE type NOT IN ('organization', 'country', 'state', 'branch');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % unexpected type value(s): %', bad_count, bad_types;
  END IF;
END $$;
--> statement-breakpoint
-- Drop partial indexes that reference the type column; ALTER TYPE can't
-- proceed while a partial predicate compares enum-incompatible literals.
DROP INDEX IF EXISTS "hierarchy_nodes_branch_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_country_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_state_sibling_name_unique";
--> statement-breakpoint
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'hierarchy_nodes' AND column_name = 'type';
  IF col_type = 'text' THEN
    ALTER TABLE hierarchy_nodes
      ALTER COLUMN type TYPE hierarchy_node_type
      USING type::hierarchy_node_type;
  END IF;
END $$;
--> statement-breakpoint
-- Recreate the partial indexes; Postgres now stores the enum-aware predicate.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_nodes_branch_name_unique"
  ON "hierarchy_nodes" ("name") WHERE "type" = 'branch';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_country_name_unique"
  ON "hierarchy_nodes" ("name")
  WHERE "type" = 'country' AND "archived_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_state_sibling_name_unique"
  ON "hierarchy_nodes" ("parent_id", "name")
  WHERE "type" = 'state' AND "archived_at" IS NULL;`,
  },
  "hierarchy-slug": {
    name: "Phase H2: add slug column to hierarchy_nodes + backfill + sibling-unique",
    sql: `ALTER TABLE hierarchy_nodes ADD COLUMN IF NOT EXISTS slug text;
--> statement-breakpoint
UPDATE hierarchy_nodes
SET slug = trim(both '_' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))),
    updated_at = now()
WHERE slug IS NULL;
--> statement-breakpoint
DO $$
DECLARE null_count int;
BEGIN
  SELECT count(*) INTO null_count FROM hierarchy_nodes WHERE slug IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % rows still have NULL slug after backfill', null_count;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE hierarchy_nodes ALTER COLUMN slug SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_sibling_slug_unique"
  ON "hierarchy_nodes" ("parent_id", "slug")
  WHERE "archived_at" IS NULL;`,
  },
  "branch-details-split": {
    name: "Phase H2: split branch-specific columns (address, pic_user_id) into branch_details table",
    sql: `CREATE TABLE IF NOT EXISTS "branch_details" (
  "node_id" uuid PRIMARY KEY REFERENCES "hierarchy_nodes"("id") ON DELETE CASCADE,
  "address" text,
  "pic_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "branch_details" ("node_id", "address", "pic_user_id")
SELECT id, address, pic_user_id FROM hierarchy_nodes
WHERE type = 'branch' AND (address IS NOT NULL OR pic_user_id IS NOT NULL)
ON CONFLICT (node_id) DO UPDATE SET
  address = EXCLUDED.address,
  pic_user_id = EXCLUDED.pic_user_id,
  updated_at = now();
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "address";
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "pic_user_id";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_details_pic_user_idx" ON "branch_details" ("pic_user_id");`,
  },
  // Add more migrations here as needed:
  // "migration-name": {
  //   name: "Description of what this does",
  //   sql: "SQL statement(s) here"
  // }
};

interface Organization {
  id: string;
  name: string;
  connectionString: string;
  neonProjectId: string;
}

/**
 * Decrypt connection string using AES-256-GCM
 */
function decryptConnectionString(encrypted: string): string {
  try {
    return decrypt(encrypted);
  } catch (error) {
    // If decryption fails, assume it's not encrypted (for backwards compatibility)
    console.warn(`Failed to decrypt connection string, assuming plaintext: ${error instanceof Error ? error.message : "Unknown error"}`);
    return encrypted;
  }
}

/**
 * Get all organizations from control panel database
 */
async function getOrganizations(controlPanelUrl: string): Promise<Organization[]> {
  const pool = new Pool({ connectionString: controlPanelUrl });

  try {
    const result = await pool.query(
      `SELECT id, name, connection_string, neon_project_id FROM organizations ORDER BY name ASC`
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      connectionString: decryptConnectionString(row.connection_string),
      neonProjectId: row.neon_project_id,
    }));
  } catch (error) {
    throw new Error(
      `Failed to fetch organizations: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  } finally {
    await pool.end();
  }
}

/**
 * Apply migration to a single tenant database
 */
async function applyMigrationToTenant(
  tenantUrl: string,
  migrationSql: string,
  organizationName: string,
  dryRun: boolean = false
): Promise<boolean> {
  const pool = new Pool({ connectionString: tenantUrl });

  try {
    if (dryRun) {
      console.log(`  [DRY RUN] Would execute:`);
      console.log(`    ${migrationSql}`);
      return true;
    }

    await pool.query(migrationSql);
    console.log(`  ✓ Migration applied successfully`);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Check if constraint already exists (idempotent)
    if (errorMsg.includes("already exists")) {
      console.log(`  ℹ Constraint already exists (skipped)`);
      return true;
    }

    console.error(`  ✗ Failed: ${errorMsg}`);
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * List available migrations
 */
function listMigrations(): void {
  console.log("\n📋 Available Migrations:\n");
  Object.entries(MIGRATIONS).forEach(([key, migration]) => {
    console.log(`  ${key}`);
    console.log(`    Description: ${migration.name}`);
    console.log(`    SQL: ${migration.sql.substring(0, 60)}...`);
    console.log();
  });
}

/**
 * Main migration runner
 */
async function runMigration(
  migrationName: string,
  dryRun: boolean = false
): Promise<void> {
  // Validate migration exists
  const migration = MIGRATIONS[migrationName];
  if (!migration) {
    console.error(`❌ Migration not found: ${migrationName}`);
    console.log(`\nAvailable migrations:`);
    Object.keys(MIGRATIONS).forEach((key) => console.log(`  - ${key}`));
    process.exit(1);
  }

  console.log(`\n${dryRun ? "🔍 DRY RUN:" : "🚀"} Running migration: ${migration.name}`);
  console.log(`Migration: ${migrationName}\n`);

  // Get control panel database URL
  const controlPanelUrl = process.env.DATABASE_URL;
  if (!controlPanelUrl) {
    throw new Error("DATABASE_URL environment variable not set");
  }

  // Fetch organizations
  console.log("📦 Fetching organizations from control panel...");
  const organizations = await getOrganizations(controlPanelUrl);

  if (organizations.length === 0) {
    console.log("⚠️  No organizations found");
    return;
  }

  console.log(`Found ${organizations.length} organization(s)\n`);

  // Apply migration to each tenant
  let successful = 0;
  let failed = 0;

  for (const org of organizations) {
    process.stdout.write(`${org.name}... `);

    try {
      const success = await applyMigrationToTenant(
        org.connectionString,
        migration.sql,
        org.name,
        dryRun
      );

      if (success) {
        successful++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(
        `✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      failed++;
    }
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Summary:`);
  console.log(`  ✓ Successful: ${successful}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  Total: ${organizations.length}`);
  console.log(`${"=".repeat(50)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

// CLI argument parsing
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Multi-Tenant Database Migration Tool

Usage:
  bun run migrate-all-tenants.ts [OPTIONS] [MIGRATION]

Options:
  --list              List all available migrations
  --dry-run           Preview changes without applying them
  --help              Show this help message

Examples:
  bun run migrate-all-tenants.ts --list
  bun run migrate-all-tenants.ts --dry-run add-unique-branch-names
  bun run migrate-all-tenants.ts add-unique-branch-names
    `);
    return;
  }

  if (args.includes("--list")) {
    listMigrations();
    return;
  }

  const dryRun = args.includes("--dry-run");
  const migrationName = args.find((arg) => !arg.startsWith("--"));

  if (!migrationName) {
    console.error("❌ Migration name required");
    process.exit(1);
  }

  try {
    await runMigration(migrationName, dryRun);
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
}

main();
