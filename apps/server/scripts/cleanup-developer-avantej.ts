/**
 * Cleanup developer.avantej@gmail.com from tenant DBs.
 *
 * Removes:
 *   - members row where userId = developer's user.id
 *   - walk_in_customers rows where createdBy = developer's user.id
 *
 * Does NOT touch control panel user/account/sessions.
 *
 * Usage:
 *   bun run scripts/cleanup-developer-avantej.ts            # dry-run
 *   bun run scripts/cleanup-developer-avantej.ts --execute  # delete
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { decrypt } from "@avantej-core/db/lib/encryption";

const TARGET_EMAIL = "developer.avantej@gmail.com";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
  const devVarsPath = join(__dirname, "../.dev.vars");
  const content = readFileSync(devVarsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([^=]+)=(.*)$/);
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

  console.log(`\nMode: ${execute ? "EXECUTE (delete)" : "DRY-RUN (no changes)"}`);
  console.log(`Target email: ${TARGET_EMAIL}\n`);

  const user = await cpDb.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, TARGET_EMAIL),
  });
  if (!user) {
    console.log("User not found in control panel. Nothing to do.");
    await cpPool.end();
    return;
  }
  console.log(`Found user.id = ${user.id}`);

  const memberships = await cpDb.query.organizationMembers.findMany({
    where: (om, { eq }) => eq(om.userId, user.id),
  });
  console.log(`Org memberships in control panel: ${memberships.length}`);

  const allOrgs = await cpDb.query.organizations.findMany();
  console.log(`Scanning ${allOrgs.length} tenant DB(s) for member/walk-in-customer rows...\n`);

  let totalMembers = 0;
  let totalWalkIns = 0;
  const perOrg: { name: string; id: string; members: number; walkIns: number }[] = [];

  for (const org of allOrgs) {
    let connStr: string;
    try {
      connStr = decrypt(org.connectionString);
    } catch (e) {
      console.log(`  [${org.name}] decrypt failed, skipping: ${(e as Error).message}`);
      continue;
    }

    const tPool = new Pool({ connectionString: connStr });
    try {
      const memberRes = await tPool.query(
        `SELECT id FROM members WHERE user_id = $1`,
        [user.id]
      );
      const walkInRes = await tPool.query(
        `SELECT id FROM walk_in_customers WHERE created_by = $1`,
        [user.id]
      );
      const m = memberRes.rows.length;
      const w = walkInRes.rows.length;
      totalMembers += m;
      totalWalkIns += w;
      perOrg.push({ name: org.name, id: org.id, members: m, walkIns: w });

      if (m > 0 || w > 0) {
        console.log(`  [${org.name}] members=${m} walk_in_customers=${w}`);
      }

      if (execute && (m > 0 || w > 0)) {
        await tPool.query("BEGIN");
        try {
          if (w > 0) {
            const r = await tPool.query(
              `DELETE FROM walk_in_customers WHERE created_by = $1`,
              [user.id]
            );
            console.log(`    deleted walk_in_customers: ${r.rowCount}`);
          }
          if (m > 0) {
            const r = await tPool.query(
              `DELETE FROM members WHERE user_id = $1`,
              [user.id]
            );
            console.log(`    deleted members: ${r.rowCount}`);
          }
          await tPool.query("COMMIT");
        } catch (err) {
          await tPool.query("ROLLBACK");
          console.log(`    ROLLBACK: ${(err as Error).message}`);
          throw err;
        }
      }
    } catch (err) {
      console.log(`  [${org.name}] error: ${(err as Error).message}`);
    } finally {
      await tPool.end();
    }
  }

  console.log(`\nSummary across all tenant DBs:`);
  console.log(`  members rows targeted: ${totalMembers}`);
  console.log(`  walk_in_customers rows targeted: ${totalWalkIns}`);
  if (!execute) {
    console.log(`\nDry-run only. Re-run with --execute to delete.`);
  } else {
    console.log(`\nDelete completed.`);
  }

  await cpPool.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });
