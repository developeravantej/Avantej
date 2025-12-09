/**
 * Script: Verify RBAC Migration and Seed Data
 * 
 * Verifies that RBAC tables exist and seed data is populated in a tenant database.
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/verify-rbac.ts <organization-slug-or-id>
 */

import { decrypt } from "@avantej-core/db";
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

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match?.[1] && match[2] !== undefined) {
        const key = match[1];
        const value = match[2];
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    console.warn("Could not load .dev.vars file:", error);
  }
}

loadDevVars();

async function verifyRBAC(orgIdentifier: string) {
  const controlPanelDb = getControlPanelDb();

  // Check if identifier is a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    orgIdentifier
  );

  // Find organization
  const organization = isUUID
    ? await controlPanelDb.query.organizations.findFirst({
        where: (orgs, { eq }) => eq(orgs.id, orgIdentifier),
      })
    : await controlPanelDb.query.organizations.findFirst({
        where: (orgs, { eq, or: orFn }) =>
          orFn(eq(orgs.slug, orgIdentifier), eq(orgs.neonProjectId, orgIdentifier)),
      });

  if (!organization) {
    throw new Error(`Organization not found: ${orgIdentifier}`);
  }

  console.log(`\n📦 Organization: ${organization.name}`);
  console.log(`   ID: ${organization.id}`);
  console.log(`   Slug: ${organization.slug}`);
  console.log(`   Neon Project: ${organization.neonProjectId}\n`);

  // Decrypt connection string
  const connectionString = decrypt(organization.connectionString);
  const tenantPool = new Pool({ connectionString });
  const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

  try {
    // Check migrations
    console.log("🔍 Checking migrations...");
    const migrations = await tenantDb.execute(
      "SELECT hash FROM drizzle_migrations ORDER BY created_at"
    );
    const migrationHashes = migrations.rows.map((r: any) => r.hash);
    console.log(`   ✅ Found ${migrationHashes.length} migration(s):`);
    migrationHashes.forEach((hash: string) => console.log(`      - ${hash}`));

    // Check RBAC tables
    console.log("\n🔍 Checking RBAC tables...");

    const roles = await tenantDb.query.roles.findMany();
    console.log(`   ✅ Roles table: ${roles.length} role(s)`);
    roles.forEach((role) => {
      console.log(`      - ${role.name} (priority: ${role.priority}, system: ${role.isSystem})`);
    });

    const permissions = await tenantDb.query.permissions.findMany();
    console.log(`   ✅ Permissions table: ${permissions.length} permission(s)`);
    permissions.forEach((perm) => {
      console.log(`      - ${perm.resource}:${perm.action}`);
    });

    const rolePermissions = await tenantDb.query.rolePermissions.findMany();
    console.log(`   ✅ Role-Permissions table: ${rolePermissions.length} mapping(s)`);

    // Check admin role permissions
    const adminRole = roles.find((r) => r.name === "admin");
    if (adminRole) {
      const adminPerms = await tenantDb.query.rolePermissions.findMany({
        where: (rp, { eq }) => eq(rp.roleId, adminRole.id),
      });
      console.log(`\n   👑 Admin role has ${adminPerms.length} permission(s)`);
    }

    console.log("\n✨ RBAC verification complete!");
  } catch (error) {
    console.error("\n❌ Error verifying RBAC:", error);
    throw error;
  } finally {
    await tenantPool.end();
  }
}

// Run script
const orgIdentifier = process.argv[2];
if (!orgIdentifier) {
  console.error("Usage: bun run scripts/verify-rbac.ts <organization-slug-or-id>");
  process.exit(1);
}

verifyRBAC(orgIdentifier)
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

