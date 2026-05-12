/**
 * Organization Routes
 *
 * Implements organization lifecycle management endpoints following the OpenAPI contract.
 *
 * Routes:
 * - POST /orgs - Create organization (requires active subscription)
 * - GET /orgs/:id - Get organization details
 * - PATCH /orgs/:id - Update organization (admin only)
 * - DELETE /orgs/:id - Delete organization (admin only, cascade)
 * - GET /orgs/:id/context - Get org context (hierarchy tree, member role, accessible nodes)
 */

import { Hono } from "hono";
import { eq, and, count, ne } from "drizzle-orm";
import { getControlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { authMiddleware } from "@/middleware/auth.middleware";
import { tenantMiddleware } from "@/middleware/tenant.middleware";
import { hierarchyMiddleware } from "@/middleware/hierarchy.middleware";
import { createTenantProject, deleteTenantProject } from "@/services/neon.service";
import { encrypt } from "@avantej-core/db";
import { runTenantMigrations, seedRBACData, LATEST_MIGRATION_VERSION } from "@avantej-core/db";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

export const organizationRoutes = new Hono();

/**
 * Helper: Generate URL-safe slug from name
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
 * Helper: Validate slug format
 */
function validateSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Hierarchy node with children (recursive structure)
 */
type HierarchyTreeNode = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  depth: number;
  createdAt: Date;
  updatedAt: Date;
  children: HierarchyTreeNode[];
};

/**
 * Helper: Build nested hierarchy tree from flat nodes
 */
function buildHierarchyTree(
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    depth: number;
    createdAt: Date;
    updatedAt: Date;
  }>
): HierarchyTreeNode[] {
  // Create a map of all nodes by ID
  const nodeMap = new Map<string, HierarchyTreeNode>();
  nodes.forEach((node) => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  // Build tree structure
  const rootNodes: HierarchyTreeNode[] = [];
  nodeMap.forEach((node) => {
    if (node.parentId === null) {
      rootNodes.push(node);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan node (shouldn't happen, but handle gracefully)
        rootNodes.push(node);
      }
    }
  });

  return rootNodes;
}

/**
 * POST /orgs
 * Create new organization (requires active subscription)
 */
organizationRoutes.post("/", authMiddleware, async (c) => {
  // Tracks the Neon project ID once provisioned, so the outer `catch` can
  // best-effort delete it if anything downstream fails. Declared outside the
  // `try` to be visible in the `catch` block.
  let provisionedProjectId: string | null = null;
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { name, slug: providedSlug, subscriptionId } = body;

    // Validate input
    if (!name || !subscriptionId) {
      return c.json({ error: "Name and subscriptionId are required" }, 400);
    }

    // Generate or validate slug
    const slug = providedSlug || generateSlug(name);
    if (!validateSlug(slug)) {
      return c.json(
        {
          error:
            "Slug must contain only lowercase letters, numbers, and hyphens",
        },
        400
      );
    }

    // Get request-scoped database client
    const controlPanelDb = getControlPanelDb(c);

    // Check if slug already exists
    const existingOrg = await controlPanelDb.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });

    if (existingOrg) {
      return c.json({ error: "Slug already taken" }, 409);
    }

    // Verify subscription exists and is active
    const subscription = await controlPanelDb.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
    });

    if (!subscription) {
      return c.json({ error: "Subscription not found" }, 404);
    }

    if (subscription.status !== "active") {
      return c.json({ error: "Subscription is not active" }, 403);
    }

    // Check organization count limit
    const orgCount = await controlPanelDb
      .select({ count: count() })
      .from(organizations)
      .where(
        and(
          eq(organizations.subscriptionId, subscriptionId),
          eq(organizations.paymentStatus, "active")
        )
      );

    const currentOrgCount = orgCount[0]?.count || 0;
    if (currentOrgCount >= subscription.organizationCountLimit) {
      return c.json(
        {
          error: `Subscription limit reached. Maximum ${subscription.organizationCountLimit} organizations allowed.`,
        },
        403
      );
    }

    // Provision organization atomically.
    //
    // Migration-failure rollback: if `runTenantMigrations` throws AFTER the
    // Neon project has been created but BEFORE the org is fully usable, we
    // best-effort delete the Neon project so we don't leak orphan tenants.
    // The control-panel transaction also rolls back on any throw, so the
    // organization row never persists. Tracked in zplan/05-06_09-12_schema-
    // relationship-fixes — Phase 0 task #5.
    const result = await controlPanelDb.transaction(async (tx) => {
      // 1. Provision Neon project
      const { projectId, connectionString } = await createTenantProject({
        slug,
        region: "aws-ap-southeast-1",
      });
      provisionedProjectId = projectId;

      // 2. Encrypt connection string
      const encryptedConnectionString = encrypt(connectionString);

      // 3. Create organization record
      const [organization] = await tx
        .insert(organizations)
        .values({
          name,
          slug,
          neonProjectId: projectId,
          connectionString: encryptedConnectionString,
          subscriptionId: subscription.id,
          paymentStatus: "active",
          ownerUserId: user.id,
          schemaVersion: LATEST_MIGRATION_VERSION,
        })
        .returning();

      if (!organization) {
        throw new Error("Failed to create organization record");
      }

      // 4. Run tenant migrations
      try {
        await runTenantMigrations(connectionString);
      } catch (migrationErr) {
        // Best-effort cleanup of the orphan Neon project, then rethrow.
        // The outer try/catch will also attempt cleanup as a safety net.
        try {
          await deleteTenantProject(projectId);
          provisionedProjectId = null;
        } catch (cleanupErr) {
          console.error(
            `[provision] Failed to delete Neon project ${projectId} after migration failure:`,
            cleanupErr,
          );
        }
        throw migrationErr;
      }

      // 5. Create tenant database client (using Pool for transaction support)
      const tenantPool = new Pool({ connectionString });
      const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

      // 5.1. Seed RBAC data (roles, permissions, role-permission mappings)
      await seedRBACData(tenantDb);

      // 6. Create default hierarchy node (organization level)
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

      // 7. Add user as organization admin member in tenant DB
      await tenantDb.insert(members).values({
        userId: user.id,
        role: "admin",
        hierarchyScopeId: orgNode.id,
        status: "active",
      });

      // 8. Add user to organization_members registry in control panel DB
      await tx.insert(organizationMembers).values({
        userId: user.id,
        organizationId: organization.id,
        role: "admin",
        status: "active",
      });

      return organization;
    });

    return c.json(
      {
        id: result.id,
        name: result.name,
        slug: result.slug,
        neonBranchId: result.neonProjectId,
        subscriptionId: result.subscriptionId,
        status: result.paymentStatus === "active" ? "active" : "suspended",
        createdAt: result.createdAt,
      },
      201
    );
  } catch (error) {
    console.error("Create organization error:", error);
    // Safety-net cleanup: if a Neon project was provisioned but the outer
    // transaction failed (and the inner migration-failure handler didn't
    // already delete it), best-effort remove the orphan project here.
    if (provisionedProjectId) {
      try {
        await deleteTenantProject(provisionedProjectId);
      } catch (cleanupErr) {
        console.error(
          `[provision] Safety-net deletion of Neon project ${provisionedProjectId} failed:`,
          cleanupErr,
        );
      }
    }
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create organization",
      },
      500
    );
  }
});

/**
 * GET /orgs/:id
 * Get organization details
 */
organizationRoutes.get("/:id", authMiddleware, tenantMiddleware, async (c) => {
  try {
    const organization = c.get("organization");

    if (!organization) {
      return c.json({ error: "Organization not found" }, 404);
    }

    // Check if user is a member (via organizationMembers registry)
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const controlPanelDb = getControlPanelDb(c);
    const memberRecord =
      await controlPanelDb.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, organization.id)
        ),
      });

    if (!memberRecord) {
      return c.json({ error: "User not a member of this organization" }, 403);
    }

    return c.json({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      neonBranchId: organization.neonProjectId,
      subscriptionId: organization.subscriptionId,
      status: organization.paymentStatus === "active" ? "active" : "suspended",
      createdAt: organization.createdAt,
    });
  } catch (error) {
    console.error("Get organization error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get organization",
      },
      500
    );
  }
});

/**
 * PATCH /orgs/:id
 * Update organization details (admin only)
 */
organizationRoutes.patch(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  hierarchyMiddleware,
  async (c) => {
    try {
      const organization = c.get("organization");
      const role = c.get("role");

      if (!organization) {
        return c.json({ error: "Organization not found" }, 404);
      }

      // Check if user is admin
      if (role !== "admin") {
        return c.json({ error: "User does not have admin role" }, 403);
      }

      const body = await c.req.json();
      const { name, slug } = body;

      // Build update object
      const updates: {
        name?: string;
        slug?: string;
        updatedAt?: Date;
      } = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        updates.name = name;
      }

      if (slug !== undefined) {
        if (!validateSlug(slug)) {
          return c.json(
            {
              error:
                "Slug must contain only lowercase letters, numbers, and hyphens",
            },
            400
          );
        }

        // Check if slug is already taken by another organization
        const controlPanelDb = getControlPanelDb(c);
        const existingOrg = await controlPanelDb.query.organizations.findFirst({
          where: and(
            eq(organizations.slug, slug),
            ne(organizations.id, organization.id) // Exclude current org
          ),
        });

        if (existingOrg) {
          return c.json({ error: "Slug already taken" }, 409);
        }

        updates.slug = slug;
      }

      // Update organization
      const controlPanelDb = getControlPanelDb(c);
      const [updated] = await controlPanelDb
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, organization.id))
        .returning();

      if (!updated) {
        return c.json({ error: "Failed to update organization" }, 500);
      }

      return c.json({
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        neonBranchId: updated.neonProjectId,
        subscriptionId: updated.subscriptionId,
        status: updated.paymentStatus === "active" ? "active" : "suspended",
        createdAt: updated.createdAt,
      });
    } catch (error) {
      console.error("Update organization error:", error);
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to update organization",
        },
        500
      );
    }
  }
);

/**
 * DELETE /orgs/:id
 * Delete organization (admin only, cascade deletes all data)
 */
organizationRoutes.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  hierarchyMiddleware,
  async (c) => {
    try {
      const organization = c.get("organization");
      const role = c.get("role");

      if (!organization) {
        return c.json({ error: "Organization not found" }, 404);
      }

      // Check if user is admin
      if (role !== "admin") {
        return c.json({ error: "User does not have admin role" }, 403);
      }

      // TODO: Delete Neon project via API
      // For now, we'll just delete the organization record
      // which will cascade delete organization_members due to FK constraint
      // The tenant database will remain but won't be accessible

      const controlPanelDb = getControlPanelDb(c);
      await controlPanelDb
        .delete(organizations)
        .where(eq(organizations.id, organization.id));

      return c.body(null, 204);
    } catch (error) {
      console.error("Delete organization error:", error);
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to delete organization",
        },
        500
      );
    }
  }
);

/**
 * GET /orgs/:id/context
 * Get organization context (hierarchy tree, member role, accessible nodes)
 */
organizationRoutes.get(
  "/:id/context",
  authMiddleware,
  tenantMiddleware,
  hierarchyMiddleware,
  async (c) => {
    try {
      const organization = c.get("organization");
      const member = c.get("member");
      const tenantDb = c.get("tenantDb");
      const accessibleNodeIds = c.get("accessibleNodeIds");

      if (!organization || !member || !tenantDb) {
        return c.json({ error: "Organization context not found" }, 404);
      }

      // Get all hierarchy nodes
      const allNodes = await tenantDb.query.hierarchyNodes.findMany({
        orderBy: (nodes, { asc }) => [asc(nodes.depth), asc(nodes.name)],
      });

      // Build nested hierarchy tree
      const hierarchyTree = buildHierarchyTree(allNodes);

      // Get hierarchy scope name
      const scopeNode = await tenantDb.query.hierarchyNodes.findFirst({
        where: eq(hierarchyNodes.id, member.hierarchyScopeId),
      });

      return c.json({
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          neonBranchId: organization.neonProjectId,
          subscriptionId: organization.subscriptionId,
          status:
            organization.paymentStatus === "active" ? "active" : "suspended",
          createdAt: organization.createdAt,
        },
        member: {
          id: member.id,
          userId: member.userId,
          organizationId: organization.id,
          role: member.role,
          hierarchyScopeId: member.hierarchyScopeId,
          hierarchyScopeName: scopeNode?.name || "Unknown",
          status: member.status,
          joinedAt: member.joinedAt,
        },
        hierarchyTree,
        accessibleNodeIds: accessibleNodeIds || [],
      });
    } catch (error) {
      console.error("Get organization context error:", error);
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to get organization context",
        },
        500
      );
    }
  }
);
