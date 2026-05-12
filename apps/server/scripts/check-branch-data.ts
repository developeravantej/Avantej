/**
 * Script to check branch data in tenant database
 * 
 * Usage: bun run scripts/check-branch-data.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
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

async function checkBranchData() {
  loadDevVars();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");

  console.log("🔍 Checking branch data...\n");

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

  // Connect to tenant DB
  const tenantConnectionString = decrypt(org.connectionString);
  const tenantPool = new Pool({ connectionString: tenantConnectionString });
  const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

  // Check all hierarchy nodes
  const allNodes = await tenantDb.query.hierarchyNodes.findMany({
    orderBy: (nodes, { asc }) => [asc(nodes.depth), asc(nodes.name)],
  });

  console.log(`\n📊 Total hierarchy nodes: ${allNodes.length}`);
  console.log("\nNodes by type:");
  const nodesByType = allNodes.reduce((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  Object.entries(nodesByType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  console.log("\nNodes by depth:");
  const nodesByDepth = allNodes.reduce((acc, node) => {
    acc[node.depth] = (acc[node.depth] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  Object.entries(nodesByDepth).forEach(([depth, count]) => {
    console.log(`  - depth ${depth}: ${count}`);
  });

  // Check branches specifically
  const branches = allNodes.filter((n) => n.type === "branch");
  console.log(`\n🌿 Branches: ${branches.length}`);
  branches.forEach((branch) => {
    console.log(`  - ${branch.id} (${branch.name}): depth=${branch.depth}, parentId=${branch.parentId}`);
  });

  // Check for target branch
  const targetBranch = allNodes.find((n) => n.id === "7cce143b-627c-472c-a6b6-57696e2b2a75");
  if (targetBranch) {
    console.log(`\n✅ Target branch found: ${targetBranch.name} (type: ${targetBranch.type}, depth: ${targetBranch.depth})`);
  } else {
    console.log(`\n❌ Target branch NOT found in database`);
  }

  // Check members
  const allMembers = await tenantDb.query.members.findMany();
  console.log(`\n👥 Members: ${allMembers.length}`);
  allMembers.forEach((member) => {
    console.log(`  - ${member.id}: userId=${member.userId}, role=${member.role}, hierarchyScopeId=${member.hierarchyScopeId}`);
    
    // Check if hierarchyScopeId exists
    const scopeNode = allNodes.find((n) => n.id === member.hierarchyScopeId);
    if (scopeNode) {
      console.log(`    ✅ Scope node exists: ${scopeNode.name} (type: ${scopeNode.type}, depth: ${scopeNode.depth})`);
    } else {
      console.log(`    ❌ Scope node NOT found!`);
    }
  });

  await tenantPool.end();
}

if (import.meta.main) {
  checkBranchData()
    .then(() => {
      console.log("\n✅ Check completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Check failed:", error);
      process.exit(1);
    });
}

export { checkBranchData };











