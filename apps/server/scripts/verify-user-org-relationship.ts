/**
 * Verify User-Organization-Member Relationship
 * 
 * Checks that franchisee@gmail.com user has proper relationships:
 * 1. User exists in control panel
 * 2. Organization member record exists in control panel
 * 3. Member record exists in tenant DB
 * 4. Member has valid hierarchyScopeId
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/verify-user-org-relationship.ts
 */

import { decrypt } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { organizations, organizationMembers } from "@avantej-core/db/schema/control-panel/index";
import { users } from "@avantej-core/db/schema/control-panel/index";
import { members } from "@avantej-core/db/schema/tenant/members";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
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

loadDevVars();

async function verifyUserOrgRelationship() {
  const testEmail = "franchisee@gmail.com";
  const controlPanelDb = getControlPanelDb();

  console.log("🔍 Verifying user-organization-member relationships...\n");

  // 1. Check user exists
  const user = await controlPanelDb.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, testEmail.toLowerCase()),
  });

  if (!user) {
    console.error("❌ User not found:", testEmail);
    process.exit(1);
  }
  console.log("✅ User found:", user.id, user.email);

  // 2. Check organization member record
  const orgMember = await controlPanelDb.query.organizationMembers.findFirst({
    where: (om, { eq }) => eq(om.userId, user.id),
  });

  if (!orgMember) {
    console.error("❌ Organization member record not found for user:", user.id);
    process.exit(1);
  }
  console.log("✅ Organization member record found:");
  console.log("   - Member ID:", orgMember.id);
  console.log("   - Organization ID:", orgMember.organizationId);
  console.log("   - Role:", orgMember.role);
  console.log("   - Status:", orgMember.status);

  // Get organization details
  const org = await controlPanelDb.query.organizations.findFirst({
    where: (orgs, { eq }) => eq(orgs.id, orgMember.organizationId),
  });

  if (!org) {
    console.error("❌ Organization not found:", orgMember.organizationId);
    process.exit(1);
  }
  console.log("   - Organization Name:", org.name);
  console.log("   - Organization Slug:", org.slug);

  // 3. Check member record in tenant DB
  const connectionString = decrypt(org.connectionString);
  const tenantPool = new Pool({ connectionString });
  const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

  try {
    const member = await tenantDb.query.members.findFirst({
      where: (members, { eq }) => eq(members.userId, user.id),
    });

    if (!member) {
      console.error("❌ Member record not found in tenant DB for user:", user.id);
      process.exit(1);
    }
    console.log("\n✅ Member record found in tenant DB:");
    console.log("   - Member ID:", member.id);
    console.log("   - User ID:", member.userId);
    console.log("   - Role:", member.role);
    console.log("   - Status:", member.status);
    console.log("   - hierarchyScopeId:", member.hierarchyScopeId);

    // 4. Verify hierarchyScopeId points to a valid node
    if (!member.hierarchyScopeId) {
      console.error("❌ Member has no hierarchyScopeId!");
      process.exit(1);
    }

    const scopeNode = await tenantDb.query.hierarchyNodes.findFirst({
      where: (nodes, { eq }) => eq(nodes.id, member.hierarchyScopeId),
    });

    if (!scopeNode) {
      console.error("❌ hierarchyScopeId points to non-existent node:", member.hierarchyScopeId);
      process.exit(1);
    }
    console.log("\n✅ hierarchyScopeId is valid:");
    console.log("   - Node ID:", scopeNode.id);
    console.log("   - Node Name:", scopeNode.name);
    console.log("   - Node Type:", scopeNode.type);
    console.log("   - Node Depth:", scopeNode.depth);

    console.log("\n✨ All relationships verified successfully!");
  } finally {
    await tenantPool.end();
  }
}

verifyUserOrgRelationship()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

