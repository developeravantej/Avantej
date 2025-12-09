/**
 * Utility Script: Check and Delete User
 * 
 * Checks if user exists and has password account, then deletes if needed.
 * Usage: bun run scripts/check-and-delete-user.ts
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
  users,
  organizations,
  organizationMembers,
} from "@avantej-core/db/schema/control-panel/index";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

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

async function checkAndDeleteUser() {
  loadDevVars();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL required");
  }

  const testEmail = "franchisee@gmail.com";

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: controlPanelSchema });

  try {
    console.log("🔍 Checking user status...\n");

    // Check if user exists
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, testEmail),
    });

    if (!user) {
      console.log("✅ User does not exist - ready to run seed script!");
      return;
    }

    console.log("📋 User Found:");
    console.log("   ID: " + user.id);
    console.log("   Email: " + user.email);
    console.log("   Name: " + user.name);
    console.log("   Email Verified: " + user.emailVerified);

    // Check if password account exists
    const passwordAccount = await db.query.account.findFirst({
      where: (account, { eq, and }) =>
        and(
          eq(account.userId, user.id),
          eq(account.providerId, "credential")
        ),
    });

    if (passwordAccount) {
      console.log("\n   ✅ Password account exists");
      console.log("   Account ID: " + passwordAccount.id);
      console.log("   Has Password: " + (passwordAccount.password ? "Yes" : "No"));
    } else {
      console.log("\n   ⚠️  NO password account found");
      console.log("   This is why login fails!");
    }

    // Check related records
    const orgMembers = await db.query.organizationMembers.findMany({
      where: (om, { eq }) => eq(om.userId, user.id),
    });

    // Check organizations owned by this user
    const ownedOrgs = await db.query.organizations.findMany({
      where: (orgs, { eq }) => eq(orgs.ownerUserId, user.id),
    });

    console.log("\n📊 Related Records:");
    console.log("   Organization Memberships: " + orgMembers.length);
    if (orgMembers.length > 0) {
      orgMembers.forEach((om) => {
        console.log("     - Org ID: " + om.organizationId + ", Role: " + om.role);
      });
    }
    console.log("   Owned Organizations: " + ownedOrgs.length);
    if (ownedOrgs.length > 0) {
      ownedOrgs.forEach((org) => {
        console.log("     - Org ID: " + org.id + ", Name: " + org.name);
      });
    }

    // Ask for confirmation (in script, we'll just proceed)
    console.log("\n🗑️  Deleting user and all related records...");

    // Step 1: Delete organization memberships (cascade should handle this, but being explicit)
    if (orgMembers.length > 0) {
      console.log("   🗑️  Deleting organization memberships...");
      await db
        .delete(organizationMembers)
        .where(eq(organizationMembers.userId, user.id));
      console.log("   ✅ Organization memberships deleted");
    }

    // Step 2: Set ownerUserId to null for owned organizations (or delete them)
    // Since this is test data, we'll delete the organizations
    if (ownedOrgs.length > 0) {
      console.log("   🗑️  Deleting owned organizations...");
      for (const org of ownedOrgs) {
        await db.delete(organizations).where(eq(organizations.id, org.id));
        console.log("     ✅ Deleted organization: " + org.name);
      }
    }

    // Step 3: Delete user (cascade will handle account, sessions, etc.)
    console.log("   🗑️  Deleting user...");
    await db.delete(users).where(eq(users.id, user.id));

    console.log("   ✅ User deleted successfully!");
    console.log("   ✅ Password account deleted (cascade)");
    console.log("   ✅ Sessions deleted (cascade)");
    console.log("   ✅ Organization memberships deleted (cascade)");
    console.log("\n✅ Ready to run seed script!");
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  checkAndDeleteUser()
    .then(() => {
      console.log("\n✅ Script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script failed:", error);
      process.exit(1);
    });
}

export { checkAndDeleteUser };

