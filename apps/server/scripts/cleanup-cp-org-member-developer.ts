/**
 * Delete control panel organization_members row + stale tenant invitations
 * for developer.avantej@gmail.com in Test Fitness Franchise org.
 *
 * Usage:
 *   bun run scripts/cleanup-cp-org-member-developer.ts            # dry-run
 *   bun run scripts/cleanup-cp-org-member-developer.ts --execute
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { decrypt } from "@avantej-core/db/lib/encryption";

const TARGET_EMAIL = "developer.avantej@gmail.com";
const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee"; // Test Fitness Franchise

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
  const p = join(__dirname, "../.dev.vars");
  const content = readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([^=]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  loadDevVars();
  const execute = process.argv.includes("--execute");
  const cpUrl = process.env.DATABASE_URL;
  if (!cpUrl) throw new Error("DATABASE_URL required");

  const cpPool = new Pool({ connectionString: cpUrl });
  const cpDb = drizzle({ client: cpPool, schema: controlPanelSchema });

  console.log(`\nMode: ${execute ? "EXECUTE" : "DRY-RUN"}`);
  console.log(`Target: ${TARGET_EMAIL} / org ${TARGET_ORG_ID}\n`);

  const user = await cpDb.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, TARGET_EMAIL),
  });
  if (!user) {
    console.log("User not found.");
    await cpPool.end();
    return;
  }
  console.log(`user.id = ${user.id}`);

  // Control panel: organization_members
  const cpRows = await cpPool.query(
    `SELECT id, role FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
    [user.id, TARGET_ORG_ID]
  );
  console.log(`control-panel organization_members rows: ${cpRows.rows.length}`);
  cpRows.rows.forEach((r: any) => console.log(`  id=${r.id} role=${r.role}`));

  if (execute && cpRows.rows.length > 0) {
    const r = await cpPool.query(
      `DELETE FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
      [user.id, TARGET_ORG_ID]
    );
    console.log(`  deleted: ${r.rowCount}`);
  }

  // Tenant: stale invitations
  const org = await cpDb.query.organizations.findFirst({
    where: (o, { eq }) => eq(o.id, TARGET_ORG_ID),
  });
  if (!org) {
    console.log("Org not found.");
    await cpPool.end();
    return;
  }
  const connStr = decrypt(org.connectionString);
  const tPool = new Pool({ connectionString: connStr });
  try {
    const inv = await tPool.query(
      `SELECT id, status FROM invitations WHERE LOWER(email) = LOWER($1)`,
      [TARGET_EMAIL]
    );
    console.log(`\ntenant invitations rows: ${inv.rows.length}`);
    inv.rows.forEach((r: any) => console.log(`  id=${r.id} status=${r.status}`));

    if (execute && inv.rows.length > 0) {
      const r = await tPool.query(
        `DELETE FROM invitations WHERE LOWER(email) = LOWER($1)`,
        [TARGET_EMAIL]
      );
      console.log(`  deleted: ${r.rowCount}`);
    }
  } finally {
    await tPool.end();
  }

  if (!execute) console.log(`\nRe-run with --execute.`);
  await cpPool.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });
