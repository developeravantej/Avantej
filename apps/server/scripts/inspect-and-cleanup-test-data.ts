/**
 * Inspection & Cleanup Script: Organization Test Data
 * 
 * This script:
 * 1. INSPECTS and reports all test-related data before cleanup
 * 2. Shows tenant databases and their tables
 * 3. Performs cleanup of test data
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/inspect-and-cleanup-test-data.ts
 * 
 * Options:
 *   --inspect-only    Only inspect, don't cleanup
 *   --cleanup-only    Skip inspection, only cleanup
 */

import { readFileSync } from "fs";
import { join } from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import ws from "ws";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { decrypt } from "@avantej-core/db";
import { deleteTenantProject } from "../src/services/neon.service";

// Configure Neon for Node.js/Bun environment (WebSocket support)
neonConfig.webSocketConstructor = ws;

// Load .dev.vars
function loadDevVars(): Record<string, string> {
  const devVarsPath = join(import.meta.dir, "../.dev.vars");
  const content = readFileSync(devVarsPath, "utf-8");
  const vars: Record<string, string> = {};
  
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      if (key !== undefined && value !== undefined) {
        vars[key] = value;
      }
    }
  }
  
  return vars;
}

/**
 * Create control panel database client for script use
 */
function createControlPanelDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema: controlPanelSchema });
}

/**
 * Get all tables in a PostgreSQL database
 */
async function getTablesInDatabase(connectionString: string): Promise<string[]> {
  const pool = new Pool({ connectionString });
  
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `) as { rows: Array<{ table_name: string }> };
    
    return result.rows.map((r) => r.table_name);
  } finally {
    await pool.end();
  }
}

/**
 * Get row count for a table
 */
async function getTableRowCount(
  connectionString: string,
  tableName: string
): Promise<number> {
  const pool = new Pool({ connectionString });
  
  try {
    // Validate table name against expected list to prevent SQL injection
    // Table names are from our own schema, but we validate for safety
    const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (sanitizedTableName !== tableName) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM "${sanitizedTableName}"`
    ) as { rows: Array<{ count: string | number }> };
    
    const count = result.rows[0]?.count;
    return typeof count === 'string' ? parseInt(count, 10) : (count || 0);
  } catch (error) {
    console.warn(`  ⚠️  Could not count rows in ${tableName}:`, error);
    return -1;
  } finally {
    await pool.end();
  }
}

/**
 * Expected tenant tables (from migrations)
 */
const EXPECTED_TENANT_TABLES = [
  "hierarchy_nodes",
  "members",
  "invitations",
  "service_categories",
  "services",
  "appointments",
  "appointment_clients",
  "appointment_staff",
  "commission_splits",
  "payments",
  "partner_stripe_accounts",
  "payouts",
  "package_instances",
  "drizzle_migrations", // Migration tracking table
];

/**
 * Inspect test data
 */
async function inspectTestData() {
  console.log("=".repeat(80));
  console.log("🔍 INSPECTION PHASE: Checking for test data");
  console.log("=".repeat(80));
  console.log();

  const vars = loadDevVars();
  
  // Set environment variables in process.env so decrypt() can access them
  for (const [key, value] of Object.entries(vars)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  
  const neonApiKey = vars.NEON_API_KEY;
  const databaseUrl = vars.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL not found in .dev.vars");
  }

  const controlPanelDb = createControlPanelDb(databaseUrl);

  // 1. Find test organizations (those with "test-" in slug or name)
  console.log("📊 Step 1: Finding test organizations...");
  const allOrgs = await controlPanelDb.query.organizations.findMany();
  
  const testOrgs = allOrgs.filter(
    (org) =>
      org.slug.includes("test-") ||
      org.name.toLowerCase().includes("test") ||
      org.slug.startsWith("test-org-")
  );

  console.log(`   Found ${testOrgs.length} test organization(s) out of ${allOrgs.length} total`);
  console.log();

  if (testOrgs.length === 0) {
    console.log("✅ No test organizations found. Nothing to inspect or cleanup.");
    return { testOrgs: [], testUsers: [], testSubscriptions: [], orgDetails: [] };
  }

  // 2. Inspect each test organization
  const orgDetails: Array<{
    org: typeof testOrgs[0];
    tenantDbExists: boolean;
    tenantTables: string[];
    tableCounts: Record<string, number>;
    neonProjectExists: boolean;
  }> = [];

  for (const org of testOrgs) {
    console.log(`📦 Organization: ${org.name} (${org.slug})`);
    console.log(`   ID: ${org.id}`);
    console.log(`   Neon Project ID: ${org.neonProjectId}`);
    console.log(`   Created: ${org.createdAt}`);

    let tenantDbExists = false;
    let tenantTables: string[] = [];
    let tableCounts: Record<string, number> = {};
    let neonProjectExists = false;

    // Check if Neon project exists
    if (neonApiKey) {
      try {
        const projectResponse = await fetch(
          `https://console.neon.tech/api/v2/projects/${org.neonProjectId}`,
          {
            headers: {
              Authorization: `Bearer ${neonApiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        neonProjectExists = projectResponse.ok;
        console.log(`   ✅ Neon Project: ${neonProjectExists ? "EXISTS" : "NOT FOUND"}`);
      } catch (error) {
        console.log(`   ⚠️  Could not check Neon project: ${error}`);
      }
    }

    // Try to connect to tenant database
    try {
      const connectionString = decrypt(org.connectionString);
      tenantDbExists = true;

      // Get all tables
      tenantTables = await getTablesInDatabase(connectionString);
      console.log(`   ✅ Tenant Database: CONNECTED`);
      console.log(`   📋 Tables found: ${tenantTables.length}`);

      // Check expected tables
      const missingTables = EXPECTED_TENANT_TABLES.filter(
        (table) => !tenantTables.includes(table)
      );
      const extraTables = tenantTables.filter(
        (table) => !EXPECTED_TENANT_TABLES.includes(table)
      );

      if (missingTables.length > 0) {
        console.log(`   ⚠️  Missing expected tables: ${missingTables.join(", ")}`);
      }
      if (extraTables.length > 0) {
        console.log(`   ℹ️  Extra tables (not in expected list): ${extraTables.join(", ")}`);
      }

      // Get row counts for key tables
      console.log(`   📊 Row counts:`);
      for (const table of EXPECTED_TENANT_TABLES.filter((t) =>
        tenantTables.includes(t)
      )) {
        const count = await getTableRowCount(connectionString, table);
        tableCounts[table] = count;
        if (count >= 0) {
          console.log(`      - ${table}: ${count} row(s)`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Tenant Database: CONNECTION FAILED`);
      console.log(`      Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    orgDetails.push({
      org,
      tenantDbExists,
      tenantTables,
      tableCounts,
      neonProjectExists,
    });

    console.log();
  }

  // 3. Find test users (those associated with test orgs)
  console.log("👥 Step 2: Finding test users...");
  const testOrgIds = testOrgs.map((o) => o.id);
  const testOrgMembers = await controlPanelDb.query.organizationMembers.findMany({
    where: (members, { inArray }) => inArray(members.organizationId, testOrgIds),
  });

  const testUserIds = [
    ...new Set([
      ...testOrgs.map((o) => o.ownerUserId).filter(Boolean) as string[],
      ...testOrgMembers.map((m) => m.userId),
    ]),
  ];

  const testUsers = testUserIds.length > 0
    ? await controlPanelDb.query.user.findMany({
        where: (users, { inArray }) => inArray(users.id, testUserIds),
      })
    : [];

  console.log(`   Found ${testUsers.length} test user(s)`);
  testUsers.forEach((user) => {
    console.log(`   - ${user.email} (${user.id})`);
  });
  console.log();

  // 4. Find test subscriptions
  console.log("💳 Step 3: Finding test subscriptions...");
  const testSubscriptionIds = testOrgs
    .map((o) => o.subscriptionId)
    .filter((id): id is string => id !== null);
  const testSubscriptions = testSubscriptionIds.length > 0
    ? await controlPanelDb.query.subscriptions.findMany({
        where: (subs, { inArray }) => inArray(subs.id, testSubscriptionIds),
      })
    : [];

  console.log(`   Found ${testSubscriptions.length} test subscription(s)`);
  testSubscriptions.forEach((sub) => {
    console.log(`   - ${sub.tier} (${sub.id}) - ${sub.status}`);
  });
  console.log();

  // 5. Summary
  console.log("=".repeat(80));
  console.log("📋 INSPECTION SUMMARY");
  console.log("=".repeat(80));
  console.log(`Test Organizations: ${testOrgs.length}`);
  console.log(`Test Users: ${testUsers.length}`);
  console.log(`Test Subscriptions: ${testSubscriptions.length}`);
  console.log();
  console.log("Tenant Database Status:");
  orgDetails.forEach((detail) => {
    console.log(`  ${detail.org.name}:`);
    console.log(`    - Tenant DB Connected: ${detail.tenantDbExists ? "✅" : "❌"}`);
    console.log(`    - Neon Project Exists: ${detail.neonProjectExists ? "✅" : "❌"}`);
    console.log(`    - Tables Created: ${detail.tenantTables.length}/${EXPECTED_TENANT_TABLES.length}`);
    if (detail.tenantDbExists) {
      const hasData = Object.values(detail.tableCounts).some((count) => count > 0);
      console.log(`    - Has Data: ${hasData ? "✅" : "⚠️  (empty)"}`);
    }
  });
  console.log();

  return {
    testOrgs,
    testUsers,
    testSubscriptions,
    orgDetails,
    controlPanelDb,
  };
}

/**
 * Cleanup test data
 */
async function cleanupTestData(
  testOrgs: Array<typeof organizations.$inferSelect>,
  testUsers: Array<typeof users.$inferSelect>,
  testSubscriptions: Array<typeof subscriptions.$inferSelect>,
  orgDetails: Array<{
    org: typeof organizations.$inferSelect;
    neonProjectExists: boolean;
  }>,
  controlPanelDb: ReturnType<typeof createControlPanelDb>
) {
  console.log("=".repeat(80));
  console.log("🗑️  CLEANUP PHASE: Removing test data");
  console.log("=".repeat(80));
  console.log();

  const vars = loadDevVars();
  const neonApiKey = vars.NEON_API_KEY;

  let deletedProjects = 0;
  let deletedOrgs = 0;
  let deletedSubscriptions = 0;
  let deletedUsers = 0;
  let errors: string[] = [];

  // 1. Delete Neon projects
  if (neonApiKey) {
    console.log("🗑️  Step 1: Deleting Neon projects...");
    for (const detail of orgDetails) {
      if (detail.neonProjectExists) {
        try {
          await deleteTenantProject(detail.org.neonProjectId, {
            NEON_API_KEY: neonApiKey,
          });
          console.log(`   ✅ Deleted Neon project: ${detail.org.neonProjectId}`);
          deletedProjects++;
        } catch (error) {
          const errorMsg = `Failed to delete Neon project ${detail.org.neonProjectId}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`   ❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      } else {
        console.log(`   ⚠️  Neon project not found (may already be deleted): ${detail.org.neonProjectId}`);
      }
    }
    console.log();
  } else {
    console.log("⚠️  NEON_API_KEY not found, skipping Neon project deletion");
    console.log();
  }

  // 2. Delete organizations (cascades to organization_members)
  console.log("🗑️  Step 2: Deleting organizations...");
  for (const org of testOrgs) {
    try {
      await controlPanelDb.delete(organizations).where(eq(organizations.id, org.id));
      console.log(`   ✅ Deleted organization: ${org.name} (${org.id})`);
      deletedOrgs++;
    } catch (error) {
      const errorMsg = `Failed to delete organization ${org.id}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`   ❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }
  console.log();

  // 3. Delete subscriptions
  console.log("🗑️  Step 3: Deleting subscriptions...");
  for (const sub of testSubscriptions) {
    try {
      await controlPanelDb.delete(subscriptions).where(eq(subscriptions.id, sub.id));
      console.log(`   ✅ Deleted subscription: ${sub.id}`);
      deletedSubscriptions++;
    } catch (error) {
      const errorMsg = `Failed to delete subscription ${sub.id}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`   ❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }
  console.log();

  // 4. Delete users
  console.log("🗑️  Step 4: Deleting users...");
  for (const user of testUsers) {
    try {
      await controlPanelDb.delete(users).where(eq(users.id, user.id));
      console.log(`   ✅ Deleted user: ${user.email} (${user.id})`);
      deletedUsers++;
    } catch (error) {
      const errorMsg = `Failed to delete user ${user.id}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`   ❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }
  console.log();

  // Summary
  console.log("=".repeat(80));
  console.log("📊 CLEANUP SUMMARY");
  console.log("=".repeat(80));
  console.log(`✅ Deleted Neon Projects: ${deletedProjects}`);
  console.log(`✅ Deleted Organizations: ${deletedOrgs}`);
  console.log(`✅ Deleted Subscriptions: ${deletedSubscriptions}`);
  console.log(`✅ Deleted Users: ${deletedUsers}`);
  if (errors.length > 0) {
    console.log(`❌ Errors: ${errors.length}`);
    errors.forEach((error) => console.log(`   - ${error}`));
  }
  console.log();
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const inspectOnly = args.includes("--inspect-only");
  const cleanupOnly = args.includes("--cleanup-only");

  try {
    if (cleanupOnly) {
      console.log("⚠️  --cleanup-only flag requires inspection data. Running full inspection first...\n");
    }

    const inspectionResult = await inspectTestData();

    if (inspectOnly) {
      console.log("✅ Inspection complete. Use without --inspect-only to cleanup.");
      return;
    }

    if (inspectionResult.testOrgs.length === 0) {
      console.log("✅ No test data found. Nothing to cleanup.");
      return;
    }

    // Ask for confirmation
    console.log("⚠️  WARNING: This will delete all test data listed above.");
    console.log("Press Ctrl+C to cancel, or wait 5 seconds to continue...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await cleanupTestData(
      inspectionResult.testOrgs,
      inspectionResult.testUsers,
      inspectionResult.testSubscriptions,
      inspectionResult.orgDetails,
      inspectionResult.controlPanelDb!
    );

    console.log("✅ Cleanup complete!");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main();

