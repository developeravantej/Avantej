/**
 * Seed Script: Franchise Owner (Tenant) for Create Branch Feature
 *
 * Creates:
 * - User: franchisee@gmail.com / password123
 * - Subscription (active)
 * - Organization (triggers tenant DB creation automatically)
 * - Member with admin role in tenant DB
 * - Sample hierarchy (Country → Region → Area)
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-franchise-owner.ts
 */

import {
  decrypt,
  encrypt,
  runTenantMigrations,
  seedRBACData,
} from "@avantej-core/db";
import { account } from "@avantej-core/db/schema/auth";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
  organizationMembers,
  organizations,
  subscriptions,
  users,
} from "@avantej-core/db/schema/control-panel/index";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes, members } from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";
import { createTenantProject } from "../src/services/neon.service";

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

function createControlPanelDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema: controlPanelSchema });
}

async function seedFranchiseOwner() {
  loadDevVars();

  const databaseUrl = process.env.DATABASE_URL;
  const neonApiKey = process.env.NEON_API_KEY;
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (!neonApiKey) throw new Error("NEON_API_KEY required");
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY required");

  console.log("🌱 Starting franchise owner seed...\n");

  const controlPanelDb = createControlPanelDb(databaseUrl);
  const controlPanelPool = new Pool({ connectionString: databaseUrl });

  const timestamp = Date.now();
  const testEmail = "franchisee@gmail.com";
  const testPassword = "password123";
  const testName = "Franchise Owner";
  const orgName = "Test Fitness Franchise";
  const orgSlug = "test-fitness-franchise"; // Fixed slug - prevents duplicate orgs

  try {
    // ============================================
    // STEP 1: Create User via Better-Auth
    // ============================================
    console.log("📝 Step 1: Checking franchise owner user...");

    // Check if user already exists (Better-Auth stores emails in lowercase)
    const existingUser = await controlPanelDb.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, testEmail.toLowerCase()),
    });

    let testUser: typeof users.$inferSelect;
    let hasPasswordAccount = false;

    if (existingUser) {
      console.log("   ⚠️  User already exists: " + existingUser.id);
      testUser = existingUser;

      // Check if user has a password account (Better-Auth account table)
      const passwordAccount = await controlPanelDb.query.account.findFirst({
        where: (account, { eq, and }) =>
          and(
            eq(account.userId, existingUser.id),
            eq(account.providerId, "credential")
          ),
      });

      if (passwordAccount) {
        hasPasswordAccount = true;
        console.log(
          "   ✅ User already has password account - ready to login!"
        );
        // Ensure email is verified for testing
        if (!existingUser.emailVerified) {
          await controlPanelDb
            .update(users)
            .set({ emailVerified: true })
            .where(eq(users.id, existingUser.id));
          console.log("   ✅ Email verification status updated to verified");
        }
      } else {
        console.log(
          "   ⚠️  User exists but has NO password account - creating it now..."
        );

        try {
          // Hash password using bcrypt (Better-Auth uses bcrypt with 10 rounds)
          // Dynamic import to avoid build-time errors
          const bcrypt = await import("bcryptjs");
          const hashedPassword = await bcrypt.default.hash(testPassword, 10);

          // Create account record manually
          const accountId = crypto.randomUUID();
          await controlPanelDb.insert(account).values({
            id: accountId,
            accountId: testEmail.toLowerCase(), // Better-Auth uses lowercase email as accountId for credential provider
            providerId: "credential",
            userId: existingUser.id,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Verify account was created
          const createdAccount = await controlPanelDb.query.account.findFirst({
            where: (account, { eq, and }) =>
              and(
                eq(account.userId, existingUser.id),
                eq(account.providerId, "credential")
              ),
          });

          if (createdAccount) {
            hasPasswordAccount = true;
            console.log("   ✅ Password account created successfully!");
          } else {
            throw new Error("Failed to verify password account creation");
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            "   ❌ Failed to create password account:",
            errorMessage
          );
          throw new Error("Failed to create password account: " + errorMessage);
        }
      }
    } else {
      const userId = crypto.randomUUID();
      const [createdUser] = await controlPanelDb
        .insert(users)
        .values({
          id: userId,
          email: testEmail.toLowerCase(), // Better-Auth stores emails in lowercase
          name: testName,
          firstName: "Franchise",
          lastName: "Owner",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!createdUser) {
        throw new Error("Failed to create test user");
      }
      testUser = createdUser;
      console.log("   ✅ Created user: " + testUser.id);

       // Create password account immediately for new users
       try {
         // Dynamic import to avoid build-time errors
         const bcrypt = await import("bcryptjs");
         const hashedPassword = await bcrypt.default.hash(testPassword, 10);
         const accountId = crypto.randomUUID();
         await controlPanelDb.insert(account).values({
           id: accountId,
           accountId: testEmail.toLowerCase(), // Better-Auth uses lowercase email as accountId for credential provider
           providerId: "credential",
           userId: testUser.id,
           password: hashedPassword,
           createdAt: new Date(),
           updatedAt: new Date(),
         });
        hasPasswordAccount = true;
        console.log("   ✅ Password account created successfully!");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("   ❌ Failed to create password account:", errorMessage);
        throw new Error("Failed to create password account: " + errorMessage);
      }
    }

    console.log("   📧 Email: " + testEmail);
    if (hasPasswordAccount) {
      console.log("   ✅ Password account ready - user can login directly!\n");
    } else {
      console.log(
        "   ⚠️  Password account creation failed - manual setup required\n"
      );
    }

    // ============================================
    // STEP 2: Create Subscription
    // ============================================
    console.log("💳 Step 2: Creating subscription...");

    const stripeSubscriptionId = "sub_seed_" + timestamp;
    const existingSubscription =
      await controlPanelDb.query.subscriptions.findFirst({
        where: (subscriptions, { eq }) =>
          eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
      });

    let subscription: typeof subscriptions.$inferSelect;
    if (existingSubscription) {
      console.log(
        "   ⚠️  Subscription already exists: " + existingSubscription.id
      );
      subscription = existingSubscription;
    } else {
      const [createdSubscription] = await controlPanelDb
        .insert(subscriptions)
        .values({
          stripeSubscriptionId,
          stripeCustomerId: "cus_seed_" + timestamp,
          tier: "professional",
          organizationCountLimit: 3,
          status: "active",
        })
        .returning();

      if (!createdSubscription) {
        throw new Error("Failed to create subscription");
      }
      subscription = createdSubscription;
      console.log("   ✅ Created subscription: " + subscription.id);
    }

    console.log("\n");

    // ============================================
    // STEP 3: Create Organization (THIS CREATES TENANT DB!)
    // ============================================
    console.log(
      "🏢 Step 3: Creating organization (will create tenant DB automatically)..."
    );

    // Check if organization already exists (by slug OR by owner user)
    const existingOrg = await controlPanelDb.query.organizations.findFirst({
      where: (orgs, { eq, or: orFn }) =>
        orFn(eq(orgs.slug, orgSlug), eq(orgs.ownerUserId, testUser.id)),
    });

    let organization: typeof organizations.$inferSelect;
    let tenantConnectionString: string;

    if (existingOrg) {
      console.log("   ⚠️  Organization already exists: " + existingOrg.id);
      console.log("   🏷️  Name: " + existingOrg.name);
      console.log("   🔗 Neon Project: " + existingOrg.neonProjectId);
      organization = existingOrg;
      tenantConnectionString = decrypt(organization.connectionString);

      // Seed RBAC data for existing org (idempotent)
      console.log("🔐 Seeding RBAC data...");
      const tenantPoolForRBAC = new Pool({
        connectionString: tenantConnectionString,
      });
      const tenantDbForRBAC = drizzle({
        client: tenantPoolForRBAC,
        schema: tenantSchema,
      });
      await seedRBACData(tenantDbForRBAC);
      console.log("   ✅ RBAC data seeded\n");
      await tenantPoolForRBAC.end();
    } else {
      const { projectId, connectionString: newConnectionString } =
        await createTenantProject(
          {
            slug: orgSlug,
            region: "aws-ap-southeast-1",
          },
          { NEON_API_KEY: neonApiKey } as { NEON_API_KEY: string }
        );

      console.log("   ✅ Created Neon project: " + projectId);

      tenantConnectionString = newConnectionString;
      const encryptedConnectionString = encrypt(newConnectionString);

      const [createdOrg] = await controlPanelDb
        .insert(organizations)
        .values({
          name: orgName,
          slug: orgSlug,
          neonProjectId: projectId,
          connectionString: encryptedConnectionString,
          subscriptionId: subscription.id,
          paymentStatus: "active",
          ownerUserId: testUser.id,
        })
        .returning();

      if (!createdOrg) {
        throw new Error("Failed to create organization");
      }
      organization = createdOrg;
      console.log("   ✅ Created organization: " + organization.id);
      console.log("   🏷️  Name: " + organization.name + "\n");

      // ============================================
      // STEP 4: Run Tenant Migrations
      // ============================================
      console.log("🔄 Step 4: Running tenant migrations...");

      await runTenantMigrations(tenantConnectionString);

      console.log("   ✅ Tenant migrations completed");

      // Create tenant database client for RBAC seeding
      const tenantPoolForRBAC = new Pool({
        connectionString: tenantConnectionString,
      });
      const tenantDbForRBAC = drizzle({
        client: tenantPoolForRBAC,
        schema: tenantSchema,
      });

      // Seed RBAC data (roles, permissions, role-permission mappings)
      console.log("🔐 Seeding RBAC data...");
      await seedRBACData(tenantDbForRBAC);
      console.log("   ✅ RBAC data seeded\n");
      await tenantPoolForRBAC.end();
    }

    // ============================================
    // STEP 5: Create Organization Member Registry (Control Panel)
    // MOVED OUTSIDE if/else - ALWAYS RUNS to ensure user can access org
    // ============================================
    console.log("👤 Step 5: Creating organization member registry...");

    // Check if member registry already exists
    const existingMemberRegistry =
      await controlPanelDb.query.organizationMembers.findFirst({
        where: (om, { eq, and: andFn }) =>
          andFn(
            eq(om.userId, testUser.id),
            eq(om.organizationId, organization.id)
          ),
      });

    if (existingMemberRegistry) {
      console.log(
        "   ⚠️  Member registry already exists: " + existingMemberRegistry.id
      );
      // Ensure it's active
      if (existingMemberRegistry.status !== "active") {
        await controlPanelDb
          .update(organizationMembers)
          .set({ status: "active" })
          .where(eq(organizationMembers.id, existingMemberRegistry.id));
        console.log("   ✅ Updated member registry status to active");
      }
    } else {
      await controlPanelDb.insert(organizationMembers).values({
        userId: testUser.id,
        organizationId: organization.id,
        role: "admin",
        status: "active",
      });
      console.log("   ✅ Created organization member registry");
    }
    console.log("\n");

    // ============================================
    // STEP 6: Seed Tenant Database
    // MOVED OUTSIDE if/else - ALWAYS RUNS to ensure tenant DB has member record
    // ============================================
    console.log("🏗️  Step 6: Seeding tenant database...");

    // Get connection string (use the one we already have)
    if (!tenantConnectionString) {
      tenantConnectionString = decrypt(organization.connectionString);
    }

    const tenantPool = new Pool({ connectionString: tenantConnectionString });
    const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

    // 6.1: Create Organization Hierarchy Node (depth 0) - check if exists first
    console.log("   📊 Creating organization hierarchy node...");

    let orgNode: typeof hierarchyNodes.$inferSelect;
    const existingOrgNode = await tenantDb.query.hierarchyNodes.findFirst({
      where: (nodes, { eq, and: andFn }) =>
        andFn(eq(nodes.type, "organization"), eq(nodes.depth, 0)),
    });

    if (existingOrgNode) {
      console.log(
        "   ⚠️  Organization node already exists: " + existingOrgNode.id
      );
      orgNode = existingOrgNode;
    } else {
      const [createdOrgNode] = await tenantDb
        .insert(hierarchyNodes)
        .values({
          name: organization.name,
          slug: organization.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          type: "organization",
          depth: 0,
          parentId: null,
        })
        .returning();

      if (!createdOrgNode) {
        throw new Error("Failed to create organization hierarchy node");
      }
      orgNode = createdOrgNode;
      console.log(`   ✅ Created organization node: ${orgNode.id}`);
    }

    // 6.2: Create Member with Admin Role (TENANT DB - hierarchyScopeId set here!)
    console.log("   👥 Creating member with admin role...");

    const existingMember = await tenantDb.query.members.findFirst({
      where: (members, { eq }) => eq(members.userId, testUser.id),
    });

    let member: typeof members.$inferSelect;
    if (existingMember) {
      console.log("   ⚠️  Member already exists: " + existingMember.id);
      member = existingMember;
      // Ensure member is active and has correct hierarchyScopeId
      if (
        existingMember.status !== "active" ||
        existingMember.hierarchyScopeId !== orgNode.id
      ) {
        await tenantDb
          .update(members)
          .set({
            status: "active",
            hierarchyScopeId: orgNode.id,
          })
          .where(eq(members.id, existingMember.id));
        console.log(
          "   ✅ Updated member status and hierarchyScopeId to match org node"
        );
        // Re-fetch to get updated member
        const updatedMember = await tenantDb.query.members.findFirst({
          where: (members, { eq }) => eq(members.id, existingMember.id),
        });
        if (updatedMember) {
          member = updatedMember;
        }
      }
    } else {
      const [createdMember] = await tenantDb
        .insert(members)
        .values({
          userId: testUser.id,
          role: "admin",
          hierarchyScopeId: orgNode.id, // ← hierarchyScopeId is HERE in TENANT DB members table
          status: "active",
        })
        .returning();

      if (!createdMember) {
        throw new Error("Failed to create member");
      }
      member = createdMember;
      console.log("   ✅ Created member with admin role");
      console.log(
        "   🔑 hierarchyScopeId: " +
          member.hierarchyScopeId +
          " (references hierarchy_nodes.id)"
      );
      console.log(
        "   📍 Location: TENANT database → members table → hierarchy_scope_id column\n"
      );
    }

    // ============================================
    // STEP 7: Optional - Create Sample Hierarchy
    // MOVED OUTSIDE if/else - ALWAYS RUNS to ensure hierarchy exists for testing
    // ============================================
    console.log(
      "🌍 Step 7: Creating sample hierarchy (optional, for testing)..."
    );

    // Check if hierarchy already exists
    const existingCountry = await tenantDb.query.hierarchyNodes.findFirst({
      where: (nodes, { eq, and }) =>
        and(eq(nodes.type, "country"), eq(nodes.name, "USA")),
    });

    let countryNode: typeof hierarchyNodes.$inferSelect | undefined;
    let stateNode: typeof hierarchyNodes.$inferSelect | undefined;

    if (existingCountry) {
      console.log("   ⚠️  Sample hierarchy already exists, skipping...\n");
    } else {
      const [createdCountryNode] = await tenantDb
        .insert(hierarchyNodes)
        .values({
          name: "USA",
          slug: "usa",
          type: "country",
          depth: 1,
          parentId: orgNode.id,
        })
        .returning();

      if (!createdCountryNode) {
        throw new Error("Failed to create country node");
      }
      countryNode = createdCountryNode;
      console.log("   ✅ Created country node: " + countryNode.id + " (USA)");

      const [createdStateNode] = await tenantDb
        .insert(hierarchyNodes)
        .values({
          name: "California",
          slug: "california",
          type: "state",
          depth: 2,
          parentId: countryNode.id,
        })
        .returning();

      if (!createdStateNode) {
        throw new Error("Failed to create state node");
      }
      stateNode = createdStateNode;
      console.log(
        "   ✅ Created state node: " + stateNode.id + " (California)\n"
      );

      // Create sample branch nodes under the state
      if (stateNode) {
        const branchNames = ["Los Angeles Branch", "San Francisco Branch"];
        for (const branchName of branchNames) {
          const existingBranch = await tenantDb.query.hierarchyNodes.findFirst({
            where: (nodes, { eq, and: andFn }) =>
              andFn(eq(nodes.type, "branch"), eq(nodes.name, branchName)),
          });

          if (!existingBranch) {
            const [createdBranch] = await tenantDb
              .insert(hierarchyNodes)
              .values({
                name: branchName,
                slug: branchName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                type: "branch",
                depth: 3,
                parentId: stateNode!.id,
              })
              .returning();

            if (createdBranch) {
              console.log(`   ✅ Created branch node: ${createdBranch.id} (${branchName})`);
            }
          } else {
            console.log(`   ⚠️  Branch already exists: ${existingBranch.id} (${branchName})`);
          }
        }
        console.log();
      }
    }

    // ============================================
    // SUMMARY
    // ============================================
    console.log("=".repeat(60));
    console.log("🎉 Seed completed successfully!");
    console.log("=".repeat(60));
    console.log("\n📋 Test Credentials:");
    console.log("   User ID: " + testUser.id);
    console.log("   Email: " + testEmail);
    console.log(
      "   Password: " + testPassword + " (set via Better-Auth sign-up)"
    );
    console.log("\n🏢 Organization Details:");
    console.log("   Organization ID: " + organization.id);
    console.log("   Name: " + organization.name);
    console.log("   Slug: " + organization.slug);
    console.log("\n🗄️  Database Details:");
    const dbHost = databaseUrl.split("@")[1];
    const tenantConnString =
      tenantConnectionString || decrypt(organization.connectionString);
    const connHost = tenantConnString.split("@")[1];
    console.log("   Control Panel DB: " + (dbHost || "unknown"));
    console.log("   Tenant DB Project: " + organization.neonProjectId);
    console.log("   Tenant Connection: " + (connHost || "unknown"));

    // Only show hierarchy details if sample hierarchy was created
    if (
      typeof countryNode !== "undefined" &&
      typeof stateNode !== "undefined"
    ) {
      console.log("\n🌳 Hierarchy Details:");
      console.log("   Organization Node ID: " + orgNode.id);
      console.log("   Country Node ID: " + countryNode.id + " (USA)");
      console.log("   State Node ID: " + stateNode.id + " (California)");
    }
    console.log("\n👤 Member Details (TENANT DB):");
    console.log("   Member ID: " + member.id);
    console.log("   User ID: " + member.userId);
    console.log("   Role: " + member.role);
    console.log(
      "   hierarchyScopeId: " +
        member.hierarchyScopeId +
        " ← IN TENANT DB members table"
    );
    console.log("   Status: " + member.status);
    console.log("\n💡 Next Steps:");
    console.log(
      "   1. ✅ Password account ready - user can login directly!"
    );
    console.log("   2. Login with: " + testEmail + " / " + testPassword);
    console.log("   3. Navigate to: /dashboard/branch/view");
    console.log("   4. Verify organization is selected and branches load");
    console.log("   5. Navigate to: /dashboard/branch/create");
    console.log("   6. Test creating a branch under California state");
    console.log("\n");

    return {
      user: { id: testUser.id, email: testEmail },
      organization: { id: organization.id, name: organization.name },
      hierarchy: {
        orgNodeId: orgNode.id,
        countryNodeId: countryNode?.id,
        stateNodeId: stateNode?.id,
      },
      member: {
        id: member.id,
        hierarchyScopeId: member.hierarchyScopeId,
      },
    };
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    throw error;
  } finally {
    await controlPanelPool.end();
  }
}

if (import.meta.main) {
  seedFranchiseOwner()
    .then(() => {
      console.log("✅ Seed script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Seed script failed:", error);
      process.exit(1);
    });
}

export { seedFranchiseOwner };
