/**
 * Integration Test: Organization Lifecycle (T102)
 *
 * Tests the full organization creation flow:
 * - Create org → verify Neon project → verify tenant migrations → verify hierarchy → verify member sync
 *
 * ⚠️  WARNING: Creates real Neon projects - they will be cleaned up automatically
 *
 * Run with: bun test src/tests/integration/org.test.ts
 * Prerequisites: DATABASE_URL, NEON_API_KEY, ENCRYPTION_KEY
 *
 * To skip integration tests: SKIP_INTEGRATION_TESTS=true bun test
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and } from "drizzle-orm";
import ws from "ws";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { createTenantProject, deleteTenantProject } from "@/services/neon.service";
import { encrypt, decrypt } from "@avantej-core/db";
import { runTenantMigrations } from "@avantej-core/db/migrate-tenant";

// Configure Neon for Node.js/Bun environment (WebSocket support for transactions)
neonConfig.webSocketConstructor = ws;

/**
 * Load environment variables from .dev.vars file
 */
function loadDevVars(): void {
  try {
    const devVarsPath = join(import.meta.dir, "../../../.dev.vars");
    const content = readFileSync(devVarsPath, "utf-8");
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        // Only set if not already in process.env (allows override)
        if (!process.env[key!]) {
          process.env[key!] = value;
        }
      }
    }
  } catch (error) {
    console.warn("Could not load .dev.vars file:", error);
  }
}

/**
 * Create control panel database client for test use
 * Uses Pool with neon-serverless adapter for transaction support
 */
function createControlPanelDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema: controlPanelSchema });
}

// Load .dev.vars at module level
loadDevVars();

describe("Organization Lifecycle Integration Tests (T102)", () => {
  const testTimestamp = Date.now();
  const testEmail = `test-org-${testTimestamp}@example.com`;
  const _testPassword = "TestPassword123!";
  void _testPassword;
  const testName = "Test User";
  const orgName = `Test Org ${testTimestamp}`;
  const orgSlug = `test-org-${testTimestamp}`;

  let controlPanelDb: ReturnType<typeof createControlPanelDb>;
  let controlPanelPool: Pool | undefined;
  let testUserId: string;
  let testSubscriptionId: string;
  let testOrgId: string;
  let testNeonProjectId: string;
  let testConnectionString: string;
  let testOrgName: string;
  let testOrgSlug: string;
  let testUserEmail: string;

  beforeAll(() => {
    if (process.env.SKIP_INTEGRATION_TESTS === "true") {
      console.log("⏭️  Skipping integration tests (SKIP_INTEGRATION_TESTS=true)");
      return;
    }

    const databaseUrl = process.env.DATABASE_URL;
    const neonApiKey = process.env.NEON_API_KEY;
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required for integration tests");
    }
    if (!neonApiKey) {
      throw new Error("NEON_API_KEY environment variable is required for integration tests");
    }
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY environment variable is required for integration tests");
    }

    const pool = new Pool({ connectionString: databaseUrl });
    controlPanelPool = pool;
    controlPanelDb = drizzle({ client: pool, schema: controlPanelSchema });
  });

  test("creates organization with full lifecycle", async () => {
    if (process.env.SKIP_INTEGRATION_TESTS === "true") {
      console.log("⏭️  Skipping integration test");
      return;
    }

    const neonApiKey = process.env.NEON_API_KEY!;

    // Step 1: Create test user directly in database
    // (In a real integration test, you'd call the auth API, but for simplicity we create directly)
    // Generate UUID for user ID (Better-Auth uses text IDs, not auto-generated UUIDs)
    const userId = crypto.randomUUID();
    const [testUser] = await controlPanelDb
      .insert(users)
      .values({
        id: userId,
        email: testEmail,
        name: testName,
        firstName: "Test",
        lastName: "User",
        emailVerified: true, // Skip email verification for test
        createdAt: new Date(),
        updatedAt: new Date(),
        // Note: passwordHash would normally be set by Better-Auth, but for test we skip it
        // In a real test, you'd use Better-Auth API to create user
      })
      .returning();

    if (!testUser) {
      throw new Error("Failed to create test user");
    }
    testUserId = testUser.id;
    testUserEmail = testEmail;
    console.log(`✅ Created test user: ${testUser.email} (${testUser.id})`);

    // Step 2: Create test subscription
    const [subscription] = await controlPanelDb
      .insert(subscriptions)
      .values({
        stripeSubscriptionId: `sub_test_${testTimestamp}`,
        stripeCustomerId: `cus_test_${testTimestamp}`,
        tier: "professional",
        organizationCountLimit: 3,
        status: "active",
      })
      .returning();

    if (!subscription) {
      throw new Error("Failed to create test subscription");
    }
    testSubscriptionId = subscription.id;
    console.log(`✅ Created test subscription: ${testSubscriptionId}`);

    // Step 3: Create organization (simulating POST /orgs endpoint logic)
    const result = await controlPanelDb.transaction(async (tx) => {
      // 3.1: Provision Neon project
      const { projectId, connectionString } = await createTenantProject(
        {
          slug: orgSlug,
          region: "aws-ap-southeast-1",
        },
        { NEON_API_KEY: neonApiKey }
      );

      testNeonProjectId = projectId;
      testConnectionString = connectionString;

      // 3.2: Encrypt connection string
      const encryptedConnectionString = encrypt(connectionString);

      // 3.3: Create organization record
      const [organization] = await tx
        .insert(organizations)
        .values({
          name: orgName,
          slug: orgSlug,
          neonProjectId: projectId,
          connectionString: encryptedConnectionString,
          subscriptionId: subscription.id,
          paymentStatus: "active",
          ownerUserId: testUserId,
        })
        .returning();

      if (!organization) {
        throw new Error("Failed to create organization record");
      }

      // 3.4: Run tenant migrations
      await runTenantMigrations(connectionString);

      // 3.5: Create tenant database client (using Pool for transaction support)
      const tenantPool = new Pool({ connectionString });
      const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

      // 3.6: Create default hierarchy node (organization level)
      const [orgNode] = await tenantDb
        .insert(hierarchyNodes)
        .values({
          name: organization.name,
          type: "organization",
          depth: 0,
          parentId: null,
        })
        .returning();

      if (!orgNode) {
        throw new Error("Failed to create organization hierarchy node");
      }

      // 3.7: Add user as organization admin member in tenant DB
      await tenantDb.insert(members).values({
        userId: testUserId,
        role: "admin",
        hierarchyScopeId: orgNode.id,
        status: "active",
      });

      // 3.8: Add user to organization_members registry in control panel DB
      await tx.insert(organizationMembers).values({
        userId: testUserId,
        organizationId: organization.id,
        role: "admin",
        status: "active",
      });

      return organization;
    });

    testOrgId = result.id;
    testOrgName = orgName;
    testOrgSlug = orgSlug;
    console.log(`✅ Created organization: ${result.name} (${result.id})`);

    // Step 4: Verify organization in control panel DB
    const orgRecord = await controlPanelDb.query.organizations.findFirst({
      where: eq(organizations.id, testOrgId),
    });

    expect(orgRecord).toBeTruthy();
    expect(orgRecord?.name).toBe(orgName);
    expect(orgRecord?.slug).toBe(orgSlug);
    expect(orgRecord?.neonProjectId).toBe(testNeonProjectId);
    expect(orgRecord?.connectionString).toBeTruthy();
    expect(orgRecord?.paymentStatus).toBe("active");
    expect(orgRecord?.ownerUserId).toBe(testUserId);

    // Step 5: Verify connection string is encrypted
    const connectionString = orgRecord!.connectionString;
    expect(connectionString).not.toContain("postgresql://"); // Should be encrypted

    // Step 6: Decrypt and verify connection string works
    const decryptedConnectionString = decrypt(connectionString);
    expect(decryptedConnectionString).toContain("postgresql://");
    expect(decryptedConnectionString).toContain("neon.tech");
    expect(decryptedConnectionString).toBe(testConnectionString);

    // Step 7: Verify tenant database is accessible and has correct tables
    const tenantPool = new Pool({ connectionString: testConnectionString });
    const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

    // Step 8: Verify default hierarchy node exists
    const hierarchyNodesList = await tenantDb.query.hierarchyNodes.findMany();
    expect(hierarchyNodesList.length).toBe(1);
    const orgNode = hierarchyNodesList[0]!;
    expect(orgNode!.name).toBe(orgName);
    expect(orgNode!.type).toBe("organization");
    expect(orgNode!.depth).toBe(0);
    expect(orgNode!.parentId).toBeNull();

    // Step 9: Verify user is added as admin member in tenant DB
    const tenantMembers = await tenantDb.query.members.findMany();
    expect(tenantMembers.length).toBe(1);
    const tenantMember = tenantMembers[0]!;
    expect(tenantMember!.userId).toBe(testUserId);
    expect(tenantMember!.role).toBe("admin");
    expect(tenantMember!.status).toBe("active");
    expect(tenantMember!.hierarchyScopeId).toBe(orgNode!.id);

    // Step 10: Verify user is in organization_members registry (control panel)
    const controlPanelMember = await controlPanelDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, testUserId),
        eq(organizationMembers.organizationId, testOrgId)
      ),
    });

    expect(controlPanelMember).toBeTruthy();
    expect(controlPanelMember?.role).toBe("admin");
    expect(controlPanelMember?.status).toBe("active");

    // Step 11: Verify dual-write sync: both databases have consistent data
    expect(tenantMember!.role).toBe(controlPanelMember!.role);
    expect(tenantMember!.status).toBe(controlPanelMember!.status);

    // Step 12: Verify Neon project exists
    const projectResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${testNeonProjectId}`,
      {
        headers: {
          Authorization: `Bearer ${neonApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    expect(projectResponse.ok).toBe(true);
    const projectData = (await projectResponse.json()) as any;
    expect(projectData.project?.id).toBe(testNeonProjectId);
    expect(projectData.project?.name).toBe(`tenant-${orgSlug}`);

    console.log("✅ All organization creation validations passed!");
  }, 60000); // 60 second timeout for integration test

  afterAll(async () => {
    if (process.env.SKIP_INTEGRATION_TESTS === "true") {
      return;
    }

    const neonApiKey = process.env.NEON_API_KEY;

    // Display test data info before cleanup (for inspection)
    if (testOrgId || testNeonProjectId) {
      console.log("\n" + "=".repeat(60));
      console.log("📊 TEST DATA INSPECTION INFO");
      console.log("=".repeat(60));
      if (testOrgId) {
        console.log(`   Organization ID: ${testOrgId}`);
        console.log(`   Organization Name: ${testOrgName || "N/A"}`);
        console.log(`   Organization Slug: ${testOrgSlug || "N/A"}`);
      }
      if (testNeonProjectId) {
        console.log(`   Neon Project ID: ${testNeonProjectId}`);
        console.log(`   Neon Project Name: tenant-${testOrgSlug || "N/A"}`);
        console.log(`   View in Neon Console: https://console.neon.tech/app/projects/${testNeonProjectId}`);
      }
      if (testUserId) {
        console.log(`   Test User ID: ${testUserId}`);
        console.log(`   Test User Email: ${testUserEmail || "N/A"}`);
      }
      if (testSubscriptionId) {
        console.log(`   Test Subscription ID: ${testSubscriptionId}`);
      }
      console.log("   (Inspection wait disabled in test runs — use INSPECT_TEST_DATA=true to enable.)");
      console.log("=".repeat(60) + "\n");

      // Optional inspection wait: only when explicitly opted in via env var.
      // Default behaviour cleans up immediately so the afterAll hook stays
      // within bun:test's default 5s hook timeout.
      if (process.env.INSPECT_TEST_DATA === "true") {
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
    }

    // Cleanup: Delete Neon project
    if (testNeonProjectId && neonApiKey) {
      try {
        await deleteTenantProject(testNeonProjectId, {
          NEON_API_KEY: neonApiKey,
        });
        console.log(`✅ Cleaned up Neon project: ${testNeonProjectId}`);
      } catch (error) {
        console.error(`⚠️  Failed to delete Neon project:`, error);
      }
    }

    // Cleanup: Delete organization (cascades to organization_members)
    if (testOrgId && controlPanelDb) {
      try {
        await controlPanelDb
          .delete(organizations)
          .where(eq(organizations.id, testOrgId));
        console.log(`✅ Cleaned up organization: ${testOrgId}`);
      } catch (error) {
        console.error(`⚠️  Failed to delete organization:`, error);
      }
    }

    // Cleanup: Delete subscription
    if (testSubscriptionId && controlPanelDb) {
      try {
        await controlPanelDb
          .delete(subscriptions)
          .where(eq(subscriptions.id, testSubscriptionId));
        console.log(`✅ Cleaned up subscription: ${testSubscriptionId}`);
      } catch (error) {
        console.error(`⚠️  Failed to delete subscription:`, error);
      }
    }

    // Cleanup: Delete test user
    if (testUserId && controlPanelDb) {
      try {
        await controlPanelDb.delete(users).where(eq(users.id, testUserId));
        console.log(`✅ Cleaned up test user: ${testUserId}`);
      } catch (error) {
        console.error(`⚠️  Failed to delete user:`, error);
      }
    }

    // Cleanup: Close control panel pool
    if (controlPanelPool) {
      try {
        await controlPanelPool.end();
        console.log(`✅ Closed control panel database pool`);
      } catch (error) {
        console.error(`⚠️  Failed to close pool:`, error);
      }
    }
  }, 120000);
});

