/**
 * Payment Service
 *
 * Handles Stripe checkout completion and organization provisioning.
 * Creates subscription, provisions Neon project, and sets up tenant database.
 *
 * Usage:
 * ```typescript
 * import { handleCheckoutCompleted } from "@/services/payment.service";
 *
 * const organization = await handleCheckoutCompleted(stripeSession);
 * ```
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { controlPanelDb } from "@/lib/db";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { createTenantProject } from "./neon.service";
import { encrypt } from "@avantej-core/db";
import { runTenantMigrations, seedRBACData } from "@avantej-core/db";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

/**
 * Determine subscription tier from checkout amount
 *
 * @param amountTotal - Total amount in cents (null if not provided)
 * @returns Tier name: "basic", "professional", or "enterprise"
 */
function determineTier(amountTotal: number | null): string {
  if (!amountTotal) return "basic";

  // Amount is in cents
  if (amountTotal >= 29900) return "enterprise"; // $299/mo or more
  if (amountTotal >= 9900) return "professional"; // $99/mo or more
  return "basic"; // $49/mo
}

/**
 * Get organization count limit for subscription tier
 *
 * @param tier - Subscription tier
 * @returns Maximum number of organizations allowed
 */
function getTierOrgLimit(tier: string): number {
  switch (tier) {
    case "enterprise":
      return 10;
    case "professional":
      return 3;
    case "basic":
      return 1;
    default:
      return 1;
  }
}

/**
 * Generate URL-safe slug from organization name
 *
 * @param name - Organization name
 * @returns URL-safe slug
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Create tenant database client from connection string
 * Uses Pool with neon-serverless adapter for transaction support
 *
 * @param connectionString - PostgreSQL connection string
 * @returns Drizzle client for tenant database
 */
function createTenantDbClient(connectionString: string) {
  const tenantPool = new Pool({ connectionString });
  return drizzle({
    client: tenantPool,
    schema: tenantSchema,
  });
}

/**
 * Handle Stripe checkout session completion
 *
 * Idempotent: Returns existing organization if subscription ID already exists.
 * Creates subscription, provisions Neon project, runs migrations, and sets up organization.
 *
 * @param session - Stripe Checkout Session object
 * @returns Created or existing organization
 * @throws Error if provisioning fails
 *
 * Process:
 * 1. Check if organization already exists (idempotency)
 * 2. Create subscription record in control panel DB
 * 3. Provision Neon project via API
 * 4. Encrypt connection string
 * 5. Create organization record
 * 6. Run tenant migrations
 * 7. Create default hierarchy node (organization level)
 * 8. Add user as admin member
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;
  const userId = session.metadata?.userId; // Set during checkout

  if (!subscriptionId || !customerId) {
    throw new Error(
      "Missing required Stripe session data: subscription or customer"
    );
  }

  // Step 1: Check idempotency - use subscription ID as key
  // Better approach: Check subscriptions table for existing subscription
  const existingSubscription =
    await controlPanelDb.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, subscriptionId),
    });

  if (existingSubscription) {
    // Find organization linked to this subscription
    const org = await controlPanelDb.query.organizations.findFirst({
      where: eq(organizations.subscriptionId, existingSubscription.id),
    });

    if (org) {
      console.log(
        `Organization already exists for subscription ${subscriptionId}`
      );
      return org;
    }
  }

  // Step 2: Provision organization atomically
  return await controlPanelDb.transaction(async (tx) => {
    // 2.1: Create subscription record (in control panel DB)
    const tier = determineTier(session.amount_total);
    const orgLimit = getTierOrgLimit(tier);

    const [subscription] = await tx
      .insert(subscriptions)
      .values({
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        tier,
        organizationCountLimit: orgLimit,
        status: "active",
      })
      .returning();

    if (!subscription) {
      throw new Error("Failed to create subscription record");
    }

    // 2.2: Generate organization name and slug
    const orgName =
      session.metadata?.orgName ||
      `Organization ${subscriptionId.substring(0, 8)}`;
    const slug = generateSlug(orgName);

    // 2.3: Provision Neon project
    const { projectId, connectionString } = await createTenantProject({
      slug,
      region: session.metadata?.region || "aws-ap-southeast-1",
    });

    // 2.4: Encrypt connection string before storage
    const encryptedConnectionString = encrypt(connectionString);

    // 2.5: Create organization record (in control panel DB)
    const [organization] = await tx
      .insert(organizations)
      .values({
        name: orgName,
        slug,
        neonProjectId: projectId,
        connectionString: encryptedConnectionString,
        subscriptionId: subscription.id,
        paymentStatus: "active",
        ownerUserId: userId || undefined,
      })
      .returning();

    if (!organization) {
      throw new Error("Failed to create organization record");
    }

    // 2.6: Initialize tenant database schema
    await runTenantMigrations(connectionString);

    // 2.7: Create tenant database client
    const tenantDb = createTenantDbClient(connectionString);

    // 2.7.1: Seed RBAC data (roles, permissions, role-permission mappings)
    await seedRBACData(tenantDb);

    // 2.8: Create default hierarchy node (organization level)
    const [orgNode] = await tenantDb
      .insert(hierarchyNodes)
      .values({
        name: organization.name,
        slug: organization.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        type: "organization",
        depth: 0,
        parentId: null,
      })
      .returning();

    if (!orgNode) {
      throw new Error("Failed to create organization hierarchy node");
    }

    // 2.9: Add user as organization admin (if userId provided)
    if (userId) {
      await tenantDb.insert(members).values({
        userId,
        role: "admin",
        hierarchyScopeId: orgNode.id,
        status: "active",
      });
    }

    console.log(
      `✓ Provisioned organization: ${organization.name} (${organization.id})`
    );
    return organization;
  });
}
