/**
 * Cleanup Script: Delete Neon Projects with "tenant-test-" prefix
 * 
 * This script finds and deletes all Neon projects that start with "tenant-test-"
 * 
 * Usage:
 *   cd apps/server
 *   bun run scripts/cleanup-test-projects.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

// Load .dev.vars
function loadDevVars(): Record<string, string> {
  const devVarsPath = join(import.meta.dir, "../.dev.vars");
  const content = readFileSync(devVarsPath, "utf-8");
  const vars: Record<string, string> = {};
  
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      if (key !== undefined && value !== undefined) {
        vars[key] = value;
      }
    }
  }
  
  return vars;
}

async function deleteTestProjects() {
  const vars = loadDevVars();
  const apiKey = vars.NEON_API_KEY;

  if (!apiKey) {
    throw new Error("NEON_API_KEY not found in .dev.vars");
  }

  console.log("🔍 Fetching all Neon projects...");

  // Fetch all projects
  const response = await fetch("https://console.neon.tech/api/v2/projects", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  const projects = data.projects || [];

  console.log(`📊 Found ${projects.length} total projects`);

  // Filter projects that start with "tenant-test-"
  const testProjects = projects.filter((p: any) => 
    p.name && p.name.startsWith("tenant-test-")
  );

  if (testProjects.length === 0) {
    console.log("✅ No projects found with 'tenant-test-' prefix");
    return;
  }

  console.log(`\n🗑️  Found ${testProjects.length} projects to delete:`);
  testProjects.forEach((p: any) => {
    console.log(`   - ${p.name} (ID: ${p.id})`);
  });

  console.log("\n⚠️  Starting deletion...\n");

  let deleted = 0;
  let failed = 0;

  for (const project of testProjects) {
    try {
      const deleteResponse = await fetch(
        `https://console.neon.tech/api/v2/projects/${project.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (deleteResponse.ok) {
        console.log(`✅ Deleted: ${project.name} (${project.id})`);
        deleted++;
      } else {
        const errorData = await deleteResponse.json().catch(() => ({}));
        console.error(`❌ Failed to delete ${project.name}: ${deleteResponse.status} ${JSON.stringify(errorData)}`);
        failed++;
      }
    } catch (error) {
      console.error(`❌ Error deleting ${project.name}:`, error);
      failed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Deleted: ${deleted}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Remaining projects: ${projects.length - deleted}`);
}

// Run the cleanup
deleteTestProjects().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});




