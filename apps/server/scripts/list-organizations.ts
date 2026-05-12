/**
 * Script: List All Organizations
 * 
 * Lists all organizations in the control panel database.
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/list-organizations.ts
 */

import { getControlPanelDb } from "../src/lib/db";

async function listOrganizations() {
  const controlPanelDb = getControlPanelDb();

  const allOrgs = await controlPanelDb.query.organizations.findMany({
    orderBy: (orgs, { desc }) => desc(orgs.createdAt),
  });

  if (allOrgs.length === 0) {
    console.log("No organizations found.");
    return;
  }

  console.log(`\n📦 Found ${allOrgs.length} organization(s):\n`);
  
  allOrgs.forEach((org, index) => {
    console.log(`${index + 1}. ${org.name}`);
    console.log(`   ID: ${org.id}`);
    console.log(`   Slug: ${org.slug}`);
    console.log(`   Neon Project: ${org.neonProjectId}`);
    console.log(`   Created: ${org.createdAt}`);
    console.log("");
  });
}

listOrganizations()
  .then(() => {
    console.log("✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });


