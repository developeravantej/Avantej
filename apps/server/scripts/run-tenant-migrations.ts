/**
 * Script to run tenant database migrations
 * 
 * Usage: bun run scripts/run-tenant-migrations.ts
 */

import { decrypt, runTenantMigrations } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function runMigrations() {
  loadDevVars();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");

  console.log("🔄 Running tenant migrations...\n");

  const controlPanelDb = drizzle({
    client: new Pool({ connectionString: databaseUrl }),
    schema: controlPanelSchema,
  });

  // Find organization
  const org = await controlPanelDb.query.organizations.findFirst({
    where: (orgs, { eq }) => eq(orgs.slug, "test-fitness-franchise"),
  });

  if (!org) {
    console.error("❌ Organization not found!");
    return;
  }

  console.log(`✅ Found organization: ${org.name} (${org.id})`);

  // Get tenant connection string
  const tenantConnectionString = decrypt(org.connectionString);
  console.log("🔄 Running migrations on tenant database...");

  await runTenantMigrations(tenantConnectionString);

  console.log("✅ Migrations completed successfully!");
}

if (import.meta.main) {
  runMigrations()
    .then(() => {
      console.log("\n✅ Script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script failed:", error);
      process.exit(1);
    });
}

export { runMigrations };








