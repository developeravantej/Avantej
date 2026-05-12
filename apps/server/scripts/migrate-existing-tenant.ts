/**
 * Script: Migrate and Seed Existing Tenant Database
 * 
 * Applies pending migrations and seeds RBAC data for an existing tenant.
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/migrate-existing-tenant.ts <organization-slug-or-id>
 * 
 * Example:
 *   bun run scripts/migrate-existing-tenant.ts billowing-hall-80532780
 */

import { decrypt, runTenantMigrations, seedRBACData } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

async function migrateExistingTenant(orgIdentifier: string) {
  const controlPanelDb = getControlPanelDb();

  // Check if identifier is a UUID (36 chars with dashes)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    orgIdentifier
  );

  // Find organization by ID, slug, or Neon project ID
  let organization;
  if (isUUID) {
    organization = await controlPanelDb.query.organizations.findFirst({
      where: (orgs, { eq }) => eq(orgs.id, orgIdentifier),
    });
  } else {
    // Try slug first, then Neon project ID
    organization = await controlPanelDb.query.organizations.findFirst({
      where: (orgs, { eq, or: orFn }) =>
        orFn(eq(orgs.slug, orgIdentifier), eq(orgs.neonProjectId, orgIdentifier)),
    });
  }

  if (!organization) {
    throw new Error(`Organization not found: ${orgIdentifier}`);
  }

  console.log(`📦 Found organization: ${organization.name} (${organization.id})`);
  console.log(`🔗 Neon Project: ${organization.neonProjectId}`);

  // Decrypt connection string
  const connectionString = decrypt(organization.connectionString);
  console.log(`✅ Decrypted connection string`);

  // Step 1: Run migrations (idempotent - only applies missing ones)
  console.log(`\n🔄 Running tenant migrations...`);
  await runTenantMigrations(connectionString);
  console.log(`✅ Migrations completed`);

  // Step 2: Seed RBAC data (idempotent - skips existing data)
  console.log(`\n🔐 Seeding RBAC data...`);
  const tenantPool = new Pool({ connectionString });
  const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });
  await seedRBACData(tenantDb);
  await tenantPool.end();
  console.log(`✅ RBAC data seeded`);

  console.log(`\n✨ Successfully migrated and seeded tenant database!`);
}

// Run script
const orgIdentifier = process.argv[2];
if (!orgIdentifier) {
  console.error("Usage: bun run scripts/migrate-existing-tenant.ts <organization-slug-or-id>");
  process.exit(1);
}

migrateExistingTenant(orgIdentifier)
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

