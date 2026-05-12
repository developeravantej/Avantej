/**
 * Delete customer_profiles row for developer.avantej@gmail.com across tenant DBs.
 * Match by userId = control panel user.id.
 *
 * Usage:
 *   bun run scripts/cleanup-customer-profile-developer.ts            # dry-run
 *   bun run scripts/cleanup-customer-profile-developer.ts --execute
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
  console.log(`Target: ${TARGET_EMAIL}\n`);

  const user = await cpDb.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, TARGET_EMAIL),
  });
  if (!user) {
    console.log("User not found.");
    await cpPool.end();
    return;
  }
  console.log(`user.id = ${user.id}\n`);

  const orgs = await cpDb.query.organizations.findMany();
  let total = 0;

  for (const org of orgs) {
    let connStr: string;
    try {
      connStr = decrypt(org.connectionString);
    } catch {
      continue;
    }
    const tPool = new Pool({ connectionString: connStr });
    try {
      const sel = await tPool.query(
        `SELECT id FROM customer_profiles WHERE user_id = $1`,
        [user.id]
      );
      const n = sel.rows.length;
      if (n === 0) continue;
      total += n;
      console.log(`  [${org.name}] customer_profiles=${n}`);

      if (execute) {
        const r = await tPool.query(
          `DELETE FROM customer_profiles WHERE user_id = $1`,
          [user.id]
        );
        console.log(`    deleted: ${r.rowCount}`);
      }
    } catch (err) {
      console.log(`  [${org.name}] error: ${(err as Error).message}`);
    } finally {
      await tPool.end();
    }
  }

  console.log(`\nTotal customer_profiles targeted: ${total}`);
  if (!execute) console.log(`Re-run with --execute to delete.`);
  await cpPool.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });
