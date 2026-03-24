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
