/**
 * Backup Script: Tenant Table Snapshot
 *
 * Exports a point-in-time JSON snapshot of the tenant tables that the
 * seed-franchise-owner script touches:
 *   - hierarchy_nodes  (branch nodes are inserted here)
 *   - members          (references hierarchy_nodes via hierarchyScopeId)
 *
 * Output files:
 *   <project-root>/Backup/hierarchy_nodes_<timestamp>.json
 *   <project-root>/Backup/members_<timestamp>.json
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backup-tenant-tables.ts
 *
 * Restore (manual):
 *   Use the saved JSON to INSERT rows back via a separate restore script or
 *   directly in Drizzle Studio / psql.
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the project root (4 levels up from apps/server/scripts/)
const PROJECT_ROOT = resolve(__dirname, "../../..");
const BACKUP_DIR = join(PROJECT_ROOT, "Backup");

function loadDevVars(): void {
  try {
    const { readFileSync } = require("fs");
    const devVarsPath = join(__dirname, "../.dev.vars");
    const content = readFileSync(devVarsPath, "utf-8");

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match?.[1] && match[2] !== undefined) {
        if (!process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      }
    }
  } catch {
    // .dev.vars not present — rely on process.env set externally
  }
}

async function backupTenantTables() {
  loadDevVars();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  console.log("💾 Starting tenant table backup...\n");

  // Connect to control panel DB to find the organisation
  const controlPanelPool = new Pool({ connectionString: databaseUrl });
  const controlPanelDb = drizzle({
    client: controlPanelPool,
    schema: controlPanelSchema,
  });

  const org = await controlPanelDb.query.organizations.findFirst({
    where: (orgs, { eq }) => eq(orgs.slug, "test-fitness-franchise"),
  });

  await controlPanelPool.end();

  if (!org) {
    throw new Error(
      'Organization "test-fitness-franchise" not found. Run seed-franchise-owner.ts first.'
    );
  }

  console.log(`✅ Found organisation: ${org.name} (${org.id})`);

  // Connect to tenant DB
  const tenantConnectionString = decrypt(org.connectionString);
  const tenantPool = new Pool({ connectionString: tenantConnectionString });
  const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

  // --- Read the tables ---
  const hierarchyNodes = await tenantDb.query.hierarchyNodes.findMany({
    orderBy: (nodes, { asc }) => [asc(nodes.depth), asc(nodes.name)],
  });

  const members = await tenantDb.query.members.findMany();

  await tenantPool.end();

  console.log(`📊 hierarchy_nodes rows: ${hierarchyNodes.length}`);
  console.log(`👥 members rows:         ${members.length}`);

  // --- Write backup files ---
  mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19); // e.g. 2026-02-18_14-30-00

  const hierarchyFile = join(BACKUP_DIR, `hierarchy_nodes_${timestamp}.json`);
  const membersFile = join(BACKUP_DIR, `members_${timestamp}.json`);

  writeFileSync(
    hierarchyFile,
    JSON.stringify(
      {
        meta: {
          table: "hierarchy_nodes",
          organisationId: org.id,
          organisationName: org.name,
          exportedAt: new Date().toISOString(),
          rowCount: hierarchyNodes.length,
        },
        rows: hierarchyNodes,
      },
      null,
      2
    )
  );

  writeFileSync(
    membersFile,
    JSON.stringify(
      {
        meta: {
          table: "members",
          organisationId: org.id,
          organisationName: org.name,
          exportedAt: new Date().toISOString(),
          rowCount: members.length,
        },
        rows: members,
      },
      null,
      2
    )
  );

  console.log(`\n✅ Backup written to:`);
  console.log(`   ${hierarchyFile}`);
  console.log(`   ${membersFile}`);
  console.log("\n📝 To restore, use the JSON rows to re-insert via Drizzle Studio or psql.");
}

if (import.meta.main) {
  backupTenantTables()
    .then(() => {
      console.log("\n✅ Backup completed.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Backup failed:", error);
      process.exit(1);
    });
}

export { backupTenantTables };
