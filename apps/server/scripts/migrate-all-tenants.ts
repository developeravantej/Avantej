/**
 * Script: Migrate and Seed All Existing Tenant Databases
 * 
 * Applies pending migrations and seeds RBAC data for all existing tenants.
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/migrate-all-tenants.ts
 */

import { decrypt, runTenantMigrations, seedRBACData } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .dev.vars
function loadDevVars(): void {
  try {
    const devVarsPath = join(__dirname, "../.dev.vars");
    const content = readFileSync(devVarsPath, "utf-8");

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        const value = valueParts.join("=").trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, "");
        process.env[key.trim()] = cleanValue;
      }
    }
  } catch (error) {
    console.warn("Could not load .dev.vars file:", error);
  }
}

// Load env vars before running
loadDevVars();

async function migrateAllTenants() {
  const controlPanelDb = getControlPanelDb();

  // Get all organizations
  const allOrgs = await controlPanelDb.query.organizations.findMany({
    orderBy: (orgs, { desc }) => desc(orgs.createdAt),
  });

  if (allOrgs.length === 0) {
    console.log("No organizations found.");
    return;
  }

  console.log(`\n📦 Found ${allOrgs.length} organization(s) to migrate\n`);

  for (let i = 0; i < allOrgs.length; i++) {
    const organization = allOrgs[i];
    console.log(`\n[${i + 1}/${allOrgs.length}] Processing: ${organization.name}`);
    console.log(`   ID: ${organization.id}`);
    console.log(`   Slug: ${organization.slug}`);
    console.log(`   Neon Project: ${organization.neonProjectId}`);

    try {
      // Decrypt connection string
      const connectionString = decrypt(organization.connectionString);
      console.log(`   ✅ Decrypted connection string`);

      // Step 1: Run migrations (idempotent - only applies missing ones)
      console.log(`   🔄 Running tenant migrations...`);
      await runTenantMigrations(connectionString);
      console.log(`   ✅ Migrations completed`);

      // Step 2: Seed RBAC data (idempotent - skips existing data)
      console.log(`   🔐 Seeding RBAC data...`);
      const tenantPool = new Pool({ connectionString });
      const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });
      await seedRBACData(tenantDb);
      await tenantPool.end();
      console.log(`   ✅ RBAC data seeded`);

      console.log(`   ✨ Successfully migrated and seeded!`);
    } catch (error) {
      console.error(`   ❌ Error migrating ${organization.name}:`, error);
      console.error(`   Continuing with next organization...`);
    }
  }

  console.log(`\n✨ Completed migrating all tenant databases!`);
}

migrateAllTenants()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

