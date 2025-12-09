/**
 * Script: Clear Control Panel Database
 * 
 * Clears all data from the control panel database.
 * WARNING: This will delete all organizations, subscriptions, users, etc.
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/clear-control-panel.ts
 */

import { getControlPanelDb } from "../src/lib/db";
import {
  organizationMembers,
  organizations,
  subscriptions,
  users,
} from "@avantej-core/db/schema/control-panel/index";
import { account, session } from "@avantej-core/db/schema/auth";

async function clearControlPanel() {
  const controlPanelDb = getControlPanelDb();

  console.log("🗑️  Clearing control panel database...\n");

  // Delete in reverse order of dependencies
  console.log("1. Deleting organization members...");
  await controlPanelDb.delete(organizationMembers);
  console.log("   ✅ Deleted organization members");

  console.log("2. Deleting organizations...");
  await controlPanelDb.delete(organizations);
  console.log("   ✅ Deleted organizations");

  console.log("3. Deleting subscriptions...");
  await controlPanelDb.delete(subscriptions);
  console.log("   ✅ Deleted subscriptions");

  console.log("4. Deleting accounts...");
  await controlPanelDb.delete(account);
  console.log("   ✅ Deleted accounts");

  console.log("5. Deleting sessions...");
  await controlPanelDb.delete(session);
  console.log("   ✅ Deleted sessions");

  console.log("6. Deleting users...");
  await controlPanelDb.delete(users);
  console.log("   ✅ Deleted users");

  console.log("\n✨ Control panel database cleared successfully!");
}

clearControlPanel()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

